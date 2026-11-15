"""Configuration centralisée des tarifs, abonnements, packs et coûts fournisseurs de Taurge.

Source unique de vérité pour l'ensemble du système économique.
Toute modification tarifaire ou de quota doit être effectuée ici.
"""

from __future__ import annotations

import math
from typing import Any


class TariffConfig:
    """Barème des opérations IA de Taurge."""

    OCR_PER_PAGE: int = 1
    OCR_STANDARD: int = 1
    TRANSLATE_OLLAMA_PER_1K_CHARS: int = 1
    TRANSLATE_DEEPL_PER_1K_CHARS: int = 4
    CLEAN_OPENCV_PER_PAGE: int = 1
    CLEAN_LAMA_BASE_PER_PAGE: int = 2
    CLEAN_LAMA_ZONE_THRESHOLD: int = 5
    CLEAN_LAMA_EXTRA_PER_ZONE_TIER: int = 1  # Par tranche de 5 zones au-delà de 5

    # État opérationnel des moteurs (pilotable depuis l'administration)
    ENGINE_STATUS: dict[str, bool] = {
        "ocr": True,
        "ollama": True,
        "deepl": True,
        "opencv": True,
        "lama": True,
    }

    @classmethod
    def is_engine_enabled(cls, engine: str) -> bool:
        norm = (engine or "").lower()
        if "deepl" in norm:
            return cls.ENGINE_STATUS.get("deepl", True)
        if "ollama" in norm:
            return cls.ENGINE_STATUS.get("ollama", True)
        if "lama" in norm:
            return cls.ENGINE_STATUS.get("lama", True)
        if "opencv" in norm:
            return cls.ENGINE_STATUS.get("opencv", True)
        if "ocr" in norm:
            return cls.ENGINE_STATUS.get("ocr", True)
        return True

    @classmethod
    def set_engine_status(cls, engine: str, enabled: bool) -> None:
        norm = (engine or "").lower()
        if norm in cls.ENGINE_STATUS:
            cls.ENGINE_STATUS[norm] = bool(enabled)

    @classmethod
    def calculate_translation_units(cls, text_or_chars: str | int) -> int:
        """Calcule le nombre d'unités tarifaires de 1 000 caractères (arrondi supérieur)."""
        char_count = len(text_or_chars) if isinstance(text_or_chars, str) else max(0, int(text_or_chars))
        if char_count == 0:
            return 0
        return max(1, math.ceil(char_count / 1000))

    @classmethod
    def calculate_translation_cost(cls, text_or_chars: str | int, engine: str = "ollama") -> int:
        """Calcule le coût en crédits pour la traduction selon le moteur et les caractères."""
        units = cls.calculate_translation_units(text_or_chars)
        if units == 0:
            return 0
        norm_engine = (engine or "ollama").lower()
        if norm_engine == "deepl":
            return units * cls.TRANSLATE_DEEPL_PER_1K_CHARS
        return units * cls.TRANSLATE_OLLAMA_PER_1K_CHARS

    @classmethod
    def get_translation_cost(cls, engine: str, text_or_chars: str | int) -> int:
        """Alias acceptant (engine, text_or_chars) ou (text_or_chars, engine)."""
        if isinstance(engine, (int, str)) and isinstance(text_or_chars, str) and not text_or_chars.isdigit():
            # Si inversé (text_or_chars, engine)
            if engine in ("ollama", "deepl"):
                return cls.calculate_translation_cost(text_or_chars, engine)
            return cls.calculate_translation_cost(engine, text_or_chars)
        return cls.calculate_translation_cost(text_or_chars, engine)

    @classmethod
    def calculate_cleaning_cost(cls, zones_count: int = 1, engine: str = "opencv") -> int:
        """Calcule le coût du nettoyage selon le moteur (OpenCV ou LaMa) et les zones."""
        norm_engine = (engine or "opencv").lower()
        if "lama" in norm_engine:
            if zones_count <= cls.CLEAN_LAMA_ZONE_THRESHOLD:
                return cls.CLEAN_LAMA_BASE_PER_PAGE
            extra_zones = zones_count - cls.CLEAN_LAMA_ZONE_THRESHOLD
            extra_tiers = math.ceil(extra_zones / cls.CLEAN_LAMA_ZONE_THRESHOLD)
            return cls.CLEAN_LAMA_BASE_PER_PAGE + (extra_tiers * cls.CLEAN_LAMA_EXTRA_PER_ZONE_TIER)
        return cls.CLEAN_OPENCV_PER_PAGE

    @classmethod
    def get_cleaning_cost(cls, engine: str, zones_count: int = 1) -> int:
        """Alias acceptant (engine, zones_count) ou (zones_count, engine)."""
        if isinstance(engine, int):
            return cls.calculate_cleaning_cost(engine, str(zones_count))
        return cls.calculate_cleaning_cost(zones_count, engine)

    @classmethod
    def get_provider_cost(cls, engine: str, chars_or_pages: int = 0) -> float:
        """Calcule le coût réel supporté par Taurge auprès du fournisseur."""
        norm = (engine or "").lower()
        if "deepl" in norm:
            return float(chars_or_pages) * PROVIDER_COSTS["deepl"]["eur_per_char"]
        return 0.0


#: Grille officielle des 4 abonnements Taurge
SUBSCRIPTION_PLANS: dict[str, dict[str, Any]] = {
    "free": {
        "id": "free",
        "name_fr": "Free",
        "name_en": "Free",
        "price_eur": 0.0,
        "price_eur_cents": 0,
        "monthly_credits": 100,
        "max_active_projects": 1,
        "max_storage_mb": 50,
        "max_glossary_entries": 30,
        "features_fr": [
            "1 projet",
            "50 Mo",
            "Glossaire de 30 entrées",
        ],
        "features_en": [
            "1 project",
            "50 MB",
            "30-entry glossary",
        ],
    },
    "creator": {
        "id": "creator",
        "name_fr": "Creator",
        "name_en": "Creator",
        "price_eur": 8.99,
        "price_eur_cents": 899,
        "monthly_credits": 500,
        "max_active_projects": 5,
        "max_storage_mb": 2048,
        "max_glossary_entries": 500,
        "features_fr": [
            "5 projets",
            "2 Go",
            "Mémoire de traduction",
        ],
        "features_en": [
            "5 projects",
            "2 GB",
            "Translation Memory",
        ],
    },
    "team": {
        "id": "team",
        "name_fr": "Team",
        "name_en": "Team",
        "price_eur": 24.99,
        "price_eur_cents": 2499,
        "monthly_credits": 1500,
        "max_active_projects": 10,
        "max_storage_mb": 10240,
        "max_glossary_entries": 5000,
        "features_fr": [
            "3 membres",
            "10 projets",
            "10 Go partagés",
        ],
        "features_en": [
            "3 members",
            "10 projects",
            "10 GB shared",
        ],
    },
    "studio": {
        "id": "studio",
        "name_fr": "Studio",
        "name_en": "Studio",
        "price_eur": 79.0,
        "price_eur_cents": 7900,
        "price_display": "79 €+",
        "monthly_credits": 0,  # Quotas personnalisés
        "max_active_projects": 50,
        "max_storage_mb": 51200,
        "max_glossary_entries": 20000,
        "on_quote": True,
        "features_fr": [
            "Quotas personnalisés",
            "Sur devis, selon les besoins et les capacités réellement disponibles.",
        ],
        "features_en": [
            "Custom quotas",
            "On quote, based on needs and available capacity.",
        ],
    },
}

#: Packs de crédits supplémentaires (distincts des abonnements)
CREDIT_PACKS: dict[str, dict[str, Any]] = {
    "mini": {
        "key": "mini",
        "name_fr": "Pack Mini",
        "name_en": "Mini Pack",
        "credits": 300,
        "price_eur": 3.99,
        "price_eur_cents": 399,
        "recommended": False,
        "unit_price_cents": 1.33,
    },
    "standard": {
        "key": "standard",
        "name_fr": "Pack Standard",
        "name_en": "Standard Pack",
        "credits": 1000,
        "price_eur": 9.99,
        "price_eur_cents": 999,
        "recommended": True,
        "unit_price_cents": 0.999,
    },
    "pro": {
        "key": "pro",
        "name_fr": "Pack Pro",
        "name_en": "Pro Pack",
        "credits": 3000,
        "price_eur": 24.99,
        "price_eur_cents": 2499,
        "recommended": False,
        "unit_price_cents": 0.833,
    },
}

#: Coûts fournisseurs estimés pour le calcul de rentabilité et marge brute
PROVIDER_COSTS: dict[str, dict[str, Any]] = {
    "deepl": {
        # Base tarifaire DeepL API payante = 20 € / 1 000 000 caractères
        "eur_per_char": 0.00002,
        "currency": "EUR",
    },
    "ollama": {
        # Moteur local exécuté sur infrastructure CPU : coût direct API nul
        "eur_per_char": 0.0,
        "currency": "EUR",
    },
    "ocr_manga": {"eur_per_page": 0.0, "currency": "EUR"},
    "ocr_paddle": {"eur_per_page": 0.0, "currency": "EUR"},
    "ocr_tesseract": {"eur_per_page": 0.0, "currency": "EUR"},
    "clean_opencv": {"eur_per_page": 0.0, "currency": "EUR"},
    "clean_lama": {"eur_per_page": 0.0, "currency": "EUR"},
}
