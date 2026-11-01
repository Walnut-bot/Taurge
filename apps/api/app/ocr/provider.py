"""Interface OCR asynchrone et sortie standardisée.

Tous les moteurs (MangaOCR, PaddleOCR) renvoient des `OCRBlockData`.
`to_dict()` fournit le JSON structuré consommé par l'API et le frontend :
texte, boîte englobante et niveau de confiance.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass
class OCRBlockData:
    text: str
    bbox_x: int
    bbox_y: int
    bbox_w: int
    bbox_h: int
    confidence: float
    provider: str = "paddleocr"

    def to_dict(self) -> dict:
        """JSON structuré exploitable par le frontend."""
        return {
            "text": self.text,
            "bbox": {
                "x": self.bbox_x,
                "y": self.bbox_y,
                "w": self.bbox_w,
                "h": self.bbox_h,
            },
            "bbox_x": self.bbox_x,
            "bbox_y": self.bbox_y,
            "bbox_w": self.bbox_w,
            "bbox_h": self.bbox_h,
            "confidence": self.confidence,
            "provider": self.provider,
        }


class OCRProvider(Protocol):
    """Contrat d'un moteur OCR concret (MangaOCR, PaddleOCR...)."""

    async def detect_text(
        self, image_bytes: bytes, source_lang: str
    ) -> list[OCRBlockData]:
        """Détecte le texte d'une image pour la langue source du projet
        (code applicatif : ``ja``, ``ko``, ``zh``, ``en``...)."""
        ...
