"""Traduction contextuelle locale via Ollama (LLM auto-hébergé).

Communication asynchrone (`httpx.AsyncClient`) avec l'instance Ollama
du poste/serveur (défaut `http://localhost:11434`, API `/api/chat`).
Le system prompt fait du modèle un expert manga/manhwa/webtoon et lui
impose le glossaire du projet. Sortie JSON stricte pour les lots, afin
de réaligner chaque traduction sur sa bulle d'origine.

Aucune clé, aucun coût par requête : c'est le moteur prioritaire.
`TranslationService` bascule sur DeepL si Ollama est injoignable, trop
lent (timeout) ou renvoie une réponse inexploitable.
"""

import json
import logging
import re

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

PROVIDER_NAME = "ollama"

SYSTEM_PROMPT_TEMPLATE = """Tu es un expert en traduction et localisation de manga, manhwa et webtoon.
Tu traduis des répliques de bulles de dialogue de '{source_lang}' vers '{target_lang}'.

Règles impératives :
1. Registre vivant et naturel : tutoiement entre pairs et amis, vouvoiement envers les supérieurs ou aînés, argot mesuré quand la scène l'exige. Jamais de traduction mot-à-mot rigide.
2. Continuité : les répliques se suivent dans l'ordre de lecture ; préserve les liens, pronoms et sous-entendus entre bulles.
3. Glossaire du projet : applique EXACTEMENT ces équivalences, sans exception :
{glossary}
4. Noms propres, onomatopées et SFX : conserve ou adapte selon l'usage de la langue cible, de façon cohérente sur tout le lot.
5. Format de sortie : réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{{"translations": ["traduction_1", "traduction_2"]}}
La liste doit contenir exactement {count} élément(s), dans le même ordre que les répliques fournies."""


def _format_glossary(glossary: dict[str, str] | None) -> str:
    if not glossary:
        return "(aucun terme imposé pour ce projet)"
    return "\n".join(f"- « {src} » -> « {dst} »" for src, dst in glossary.items())


def _parse_translations(content: str, expected: int) -> list[str]:
    """Extrait la liste de traductions de la réponse du LLM.

    Tolère un JSON entouré de texte (fences, préambule) ; lève
    `RuntimeError` si le compte ne correspond pas, ce qui déclenche
    le fallback DeepL du service plutôt qu'un mauvais alignement.
    """
    candidates: list[str] = []
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict) and isinstance(parsed.get("translations"), list):
            candidates = [str(t).strip() for t in parsed["translations"]]
        elif isinstance(parsed, list):
            candidates = [str(t).strip() for t in parsed]
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}|\[.*\]", content, re.DOTALL)
        if match:
            return _parse_translations(match.group(0), expected)
    if len(candidates) != expected:
        raise RuntimeError(
            f"Ollama : {len(candidates)} traduction(s) reçue(s), {expected} attendue(s)."
        )
    return candidates


class OllamaProvider:
    """Client asynchrone de l'API chat d'Ollama."""

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: httpx.Timeout | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model = model or settings.ollama_model
        # Lecture longue : un LLM local peut mettre >30 s sur un lot.
        self.timeout = timeout or httpx.Timeout(
            connect=5.0, read=float(settings.ollama_timeout_seconds), write=10.0, pool=5.0
        )
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url, timeout=self.timeout, transport=self._transport
        )

    async def is_available(self) -> bool:
        """Sonde rapide de l'instance (`GET /api/tags`, 3 s max)."""
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(3.0),
                transport=self._transport,
            ) as client:
                response = await client.get("/api/tags")
                return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def translate_batch(
        self,
        texts: list[str],
        source_lang: str,
        target_lang: str,
        glossary: dict[str, str] | None = None,
    ) -> list[str]:
        """Traduit un lot de bulles en un seul appel contextuel."""
        texts = [t or "" for t in texts]
        if not texts:
            return []
        if not any(t.strip() for t in texts):
            return list(texts)

        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            source_lang=source_lang,
            target_lang=target_lang,
            glossary=_format_glossary(glossary),
            count=len(texts),
        )
        numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(texts))
        payload = {
            "model": self.model,
            "stream": False,
            "format": "json",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Répliques à traduire :\n{numbered}"},
            ],
            "options": {"temperature": 0.3},
        }
        logger.info(
            "[Ollama] Traduction %s->%s de %d bulle(s), modèle=%s",
            source_lang, target_lang, len(texts), self.model,
        )
        try:
            async with self._client() as client:
                response = await client.post("/api/chat", json=payload)
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise RuntimeError(f"Ollama — délai dépassé ({self.base_url}) : {exc}") from exc
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                f"Ollama — erreur HTTP {exc.response.status_code} : {exc.response.text[:300]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Ollama — instance injoignable ({self.base_url}) : {exc}") from exc

        try:
            content = response.json()["message"]["content"]
        except (ValueError, KeyError, TypeError) as exc:
            raise RuntimeError("Ollama — réponse JSON inattendue (pas de message.content).") from exc
        return _parse_translations(content, len(texts))

    async def translate(
        self, text: str, source_lang: str, target_lang: str
    ) -> str:
        if not text or not text.strip():
            return ""
        results = await self.translate_batch([text], source_lang, target_lang)
        return results[0] if results else text
