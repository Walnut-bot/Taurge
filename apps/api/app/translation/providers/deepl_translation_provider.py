"""Fallback de traduction : API DeepL gratuite (https://api-free.deepl.com).

Utilisé uniquement quand Ollama (local, prioritaire) échoue : timeout,
instance arrêtée ou réponse inexploitable. Nécessite `DEEPL_API_KEY`
(clé « DeepL API Free », se terminant par `:fx`). Les appels sont
asynchrones (`httpx.AsyncClient`) et regroupés par lot (une requête
par page) pour préserver le quota gratuit.

DeepL n'accepte pas de prompt : le glossaire du projet est appliqué en
amont/aval par les routeurs (remplacement des termes verrouillés), ce
provider garantit la fidélité littérale de secours.
"""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

PROVIDER_NAME = "deepl"

# Code applicatif -> code DeepL. En source, DeepL n'accepte que ZH
# pour le chinois (ZH-HANS/ZH-HANT y sont rejetés en HTTP 400, vérifié
# contre l'API) ; en cible, les variantes Hans/Hant sont acceptées.
_SOURCE_MAP = {
    "zh": "ZH",
    "zh-hans": "ZH",
    "zh-cn": "ZH",
    "zh-hant": "ZH",
    "zh-tw": "ZH",
}
_TARGET_MAP = {
    "zh": "ZH",
    "zh-hans": "ZH-HANS",
    "zh-cn": "ZH-HANS",
    "zh-hant": "ZH-HANT",
    "zh-tw": "ZH-HANT",
    "en": "EN-US",
    "pt": "PT-PT",
}


def _deepl_lang(code: str, *, target: bool) -> str:
    key = (code or "").strip().lower()
    table = _TARGET_MAP if target else _SOURCE_MAP
    return table.get(key, key.upper())


class DeepLProvider:
    """Client asynchrone de l'API DeepL Free."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: httpx.Timeout | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = (api_key if api_key is not None else settings.deepl_api_key) or ""
        self.base_url = (base_url or settings.deepl_api_base_url).rstrip("/")
        self.timeout = timeout or httpx.Timeout(
            connect=5.0, read=float(settings.deepl_timeout_seconds), write=10.0, pool=5.0
        )
        self._transport = transport

    def is_available(self) -> bool:
        """Vrai si une clé DeepL est configurée."""
        return bool(self.api_key.strip())

    async def translate_batch(
        self,
        texts: list[str],
        source_lang: str,
        target_lang: str,
        glossary: dict[str, str] | None = None,
    ) -> list[str]:
        """Traduit un lot en une requête DeepL (textes vides préservés)."""
        if not texts:
            return []
        if not self.is_available():
            raise RuntimeError("DEEPL_API_KEY non configurée — DeepLProvider indisponible.")
        non_empty = [t for t in texts if t and t.strip()]
        if not non_empty:
            return list(texts)

        logger.info(
            "[DeepL] Traduction %s->%s de %d bulle(s)",
            source_lang, target_lang, len(non_empty),
        )
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url, timeout=self.timeout, transport=self._transport
            ) as client:
                response = await client.post(
                    "/v2/translate",
                    headers={"Authorization": f"DeepL-Auth-Key {self.api_key}"},
                    data={
                        "text": non_empty,
                        "source_lang": _deepl_lang(source_lang, target=False),
                        "target_lang": _deepl_lang(target_lang, target=True),
                    },
                )
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise RuntimeError(f"DeepL — délai dépassé : {exc}") from exc
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                f"DeepL — erreur HTTP {exc.response.status_code} : {exc.response.text[:300]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise RuntimeError(f"DeepL — API injoignable ({self.base_url}) : {exc}") from exc

        try:
            translations = response.json()["translations"]
            translated = [str(item["text"]) for item in translations]
        except (ValueError, KeyError, TypeError) as exc:
            raise RuntimeError("DeepL — réponse JSON inattendue (pas de translations).") from exc
        if len(translated) != len(non_empty):
            raise RuntimeError(
                f"DeepL : {len(translated)} traduction(s) reçue(s), {len(non_empty)} attendue(s)."
            )

        # Réaligne sur les textes d'origine (positions des vides conservées).
        iterator = iter(translated)
        return [next(iterator) if t and t.strip() else t for t in texts]

    async def translate(
        self, text: str, source_lang: str, target_lang: str
    ) -> str:
        if not text or not text.strip():
            return ""
        results = await self.translate_batch([text], source_lang, target_lang)
        if not results:
            raise RuntimeError("DeepL — aucune traduction renvoyée.")
        return results[0]
