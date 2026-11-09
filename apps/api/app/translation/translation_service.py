"""Service de traduction : Ollama prioritaire, fallback DeepL automatique.

1. `OllamaProvider` (local, gratuit, contextuel, glossaire injecté dans
   le prompt) — toujours tenté en premier.
2. `DeepLProvider` (API gratuite) — uniquement si Ollama échoue :
   timeout, instance injoignable ou réponse inexploitable.

`last_provider` expose le moteur ayant réellement traduit le dernier
lot (« ollama » ou « deepl ») pour l'enregistrer en base. Si les deux
moteurs échouent, une `RuntimeError` chaînée est levée : aucun texte
source n'est renvoyé silencieusement comme s'il était traduit.
"""

import asyncio
import logging

from app.core.config import settings
from app.translation.providers.deepl_translation_provider import DeepLProvider
from app.translation.providers.ollama_translation_provider import OllamaProvider

logger = logging.getLogger(__name__)


class TranslationService:
    """Orchestrateur de traduction consommé par routeurs et jobs."""

    def __init__(
        self,
        ollama: OllamaProvider | None = None,
        deepl: DeepLProvider | None = None,
        ollama_budget_seconds: float | None = None,
    ) -> None:
        self._ollama = ollama or OllamaProvider()
        self._deepl = deepl or DeepLProvider()
        self._ollama_budget = (
            float(settings.ollama_budget_with_fallback_seconds)
            if ollama_budget_seconds is None
            else float(ollama_budget_seconds)
        )
        self.last_provider: str | None = None

    def _deepl_available(self) -> bool:
        try:
            return bool(self._deepl.is_available())
        except Exception:
            return False

    async def translate_batch(
        self,
        texts: list[str],
        source_lang: str,
        target_lang: str,
        glossary: dict[str, str] | None = None,
    ) -> list[str]:
        """Traduit un lot via Ollama, avec repli DeepL en cas d'échec."""
        if not texts:
            return []
        try:
            call = self._ollama.translate_batch(
                texts, source_lang, target_lang, glossary=glossary
            )
            if self._deepl_available() and self._ollama_budget > 0:
                # DeepL peut prendre le relais : inutile d'attendre les
                # 120 s du timeout Ollama sur un LLM local trop lent.
                result = await asyncio.wait_for(call, timeout=self._ollama_budget)
            else:
                result = await call
            if len(result) != len(texts):
                # Réponse inexploitable : ne jamais renvoyer un lot
                # tronqué/vide comme s'il était traduit -> repli DeepL.
                raise RuntimeError(
                    f"Ollama : {len(result)} traduction(s) reçue(s), {len(texts)} attendue(s)."
                )
            self.last_provider = "ollama"
            return result
        except Exception as ollama_exc:
            logger.warning(
                "[TranslationService] Ollama indisponible, fallback DeepL : %s", ollama_exc
            )
        try:
            result = await self._deepl.translate_batch(
                texts, source_lang, target_lang, glossary=glossary
            )
        except Exception as deepl_exc:
            raise RuntimeError(
                f"Traduction impossible — Ollama et DeepL ont échoué : {deepl_exc}"
            ) from deepl_exc
        if len(result) != len(texts):
            raise RuntimeError(
                f"Traduction impossible — DeepL : {len(result)} traduction(s) "
                f"reçue(s), {len(texts)} attendue(s)."
            )
        self.last_provider = "deepl"
        return result

    async def translate(
        self, text: str, source_lang: str, target_lang: str
    ) -> str:
        if not text or not text.strip():
            return ""
        results = await self.translate_batch([text], source_lang, target_lang)
        if not results:
            # Jamais le texte source déguisé en traduction.
            raise RuntimeError("Traduction impossible — aucun moteur n'a répondu.")
        return results[0]
