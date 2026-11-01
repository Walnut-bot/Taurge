from typing import Protocol


class TranslationProvider(Protocol):
    """Contrat asynchrone d'un moteur de traduction (Ollama, DeepL...)."""

    async def translate(
        self, text: str, source_lang: str, target_lang: str
    ) -> str: ...

    async def translate_batch(
        self,
        texts: list[str],
        source_lang: str,
        target_lang: str,
        glossary: dict[str, str] | None = None,
    ) -> list[str]:
        """Traduit un lot en un appel (contexte global de la page et
        respect du glossaire), dans le même ordre que `texts`."""
        ...
