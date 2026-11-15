"""Service de traduction Taurge — Moteur explicite sans bascule silencieuse (Partie 3.2).

Règles impératives :
1. Respect strict du moteur choisi par l'utilisateur :
   - 'ollama' : traduction standard locale (Llama 3.1 8B).
   - 'deepl' : traduction premium via API DeepL.
2. Aucun repli silencieux vers DeepL : si Ollama échoue, lever une exception explicite
   afin que l'utilisateur puisse choisir en toute connaissance s'il souhaite engager le surcoût
   de crédits DeepL (4 crédits / 1 000 caractères).
3. Contrôle du contingent mensuel DeepL : vérifié avant appel, caractères réels enregistrés en base.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlmodel import Session

from app.billing.deepl_quota_service import check_deepl_quota_available, record_deepl_usage
from app.billing.tariffs import TariffConfig
from app.core.config import settings
from app.core.db import engine as db_engine
from app.translation.providers.deepl_translation_provider import DeepLProvider
from app.translation.providers.ollama_translation_provider import OllamaProvider

logger = logging.getLogger(__name__)


class TranslationService:
    """Orchestrateur de traduction respectant le choix explicite de l'utilisateur."""

    def __init__(
        self,
        ollama: OllamaProvider | None = None,
        deepl: DeepLProvider | None = None,
    ) -> None:
        self._ollama = ollama or OllamaProvider()
        self._deepl = deepl or DeepLProvider()
        self.last_provider: str | None = None
        self.last_chars_count: int = 0

    def is_deepl_available(self) -> bool:
        """Vérifie si la clé API DeepL est configurée."""
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
        engine: str = "ollama",
    ) -> list[str]:
        """Traduit un lot de textes avec le moteur EXPLICITEMENT sélectionné."""
        if not texts:
            self.last_chars_count = 0
            return []

        norm_engine = (engine or "ollama").strip().lower()
        if not TariffConfig.is_engine_enabled(norm_engine):
            raise RuntimeError(
                f"Le moteur de traduction '{norm_engine.capitalize()}' est temporairement suspendu par l'administrateur."
            )

        total_chars = sum(len(t) for t in texts if t)
        self.last_chars_count = total_chars

        if norm_engine == "deepl":
            # 1. Moteur DeepL Premium explicitement demandé
            if not self.is_deepl_available():
                raise RuntimeError(
                    "L'API DeepL Premium n'est pas configurée sur ce serveur (clé DEEPL_API_KEY absente)."
                )

            # Vérification du contingent global DeepL
            with Session(db_engine) as session:
                check_deepl_quota_available(session, total_chars)

            try:
                result = await self._deepl.translate_batch(
                    texts, source_lang, target_lang, glossary=glossary
                )
            except Exception as exc:
                logger.error("[TranslationService] Échec DeepL : %s", exc)
                raise RuntimeError(f"Échec de la traduction DeepL Premium : {exc}") from exc

            if len(result) != len(texts):
                raise RuntimeError(
                    f"Réponse DeepL incomplète : {len(result)} traduction(s) reçue(s), {len(texts)} attendue(s)."
                )

            # Enregistrement des caractères réellement consommés au niveau global
            with Session(db_engine) as session:
                record_deepl_usage(session, total_chars)

            self.last_provider = "deepl"
            return result

        # 2. Moteur Ollama Standard (Local) par défaut
        try:
            result = await self._ollama.translate_batch(
                texts, source_lang, target_lang, glossary=glossary
            )
        except Exception as ollama_exc:
            logger.warning("[TranslationService] Échec Ollama : %s", ollama_exc)
            # Pas de fallback silencieux vers DeepL : l'utilisateur doit choisir !
            raise RuntimeError(
                f"Le moteur Ollama local n'a pas pu répondre : {ollama_exc}. "
                f"Vous pouvez réessayer ou sélectionner explicitement la traduction DeepL Premium."
            ) from ollama_exc

        if len(result) != len(texts):
            raise RuntimeError(
                f"Réponse Ollama inexploitable : {len(result)} traduction(s) reçue(s), {len(texts)} attendue(s)."
            )

        self.last_provider = "ollama"
        return result

    async def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        engine: str = "ollama",
    ) -> str:
        if not text or not text.strip():
            return ""
        results = await self.translate_batch([text], source_lang, target_lang, engine=engine)
        if not results:
            raise RuntimeError("Traduction impossible — aucun résultat renvoyé par le moteur.")
        return results[0]
