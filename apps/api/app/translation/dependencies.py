from app.translation.translation_service import TranslationService

# Point de câblage unique : Ollama prioritaire, fallback DeepL automatique.
translation_service = TranslationService()


def get_translation_provider() -> TranslationService:
    return translation_service
