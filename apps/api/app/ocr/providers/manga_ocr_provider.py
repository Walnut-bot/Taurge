"""Expert OCR japonais : MangaOCR (https://github.com/kha-white/manga-ocr).

Spécialisation :
- texte vertical japonais (tategaki), lu de droite à gauche ;
- furigana : les petits kana accolés aux kanji sont reconnus par le
  modèle et fusionnés dans la lecture de la bulle ;
- aucun modèle de détection séparé : manga-ocr reconnaît un extrait
  d'image, donc ce provider découpe d'abord la page en zones de texte
  (contours OpenCV), trie les zones dans l'ordre de lecture vertical,
  puis reconnaît chaque zone.

Le modèle est lourd (transformers/torch) : il est chargé paresseusement
dans un thread (``asyncio.to_thread``) pour ne jamais bloquer la boucle
événementielle FastAPI, puis mis en cache pour le processus.
"""

import asyncio
import io
import logging

import cv2
import numpy as np
from PIL import Image

from app.ocr.provider import OCRBlockData

logger = logging.getLogger(__name__)

PROVIDER_NAME = "manga-ocr"

# manga-ocr ne fournit pas de score : confiance conventionnelle d'une
# lecture non vide, minorée pour les très petits extraits (furigana
# isolés, bruit) afin que l'UI signale les lectures incertaines.
_CONFIDENCE_FULL = 0.90
_CONFIDENCE_SMALL = 0.60
_SMALL_AREA_PX = 900


class MangaOCRProvider:
    """Reconnaissance du japonais (vertical + furigana) via manga-ocr."""

    def __init__(self) -> None:
        self._engine = None
        self._engine_lock = asyncio.Lock()

    async def _get_engine(self):
        """Charge manga-ocr une seule fois, hors boucle événementielle."""
        if self._engine is not None:
            return self._engine
        async with self._engine_lock:
            if self._engine is None:
                try:
                    from manga_ocr import MangaOcr
                except Exception as exc:
                    raise RuntimeError(
                        "manga-ocr indisponible sur cette machine "
                        f"({exc}) : `pip install -r requirements-ocr.txt`, "
                        "ou repli Tesseract (jpn)."
                    ) from exc
                logger.info("[MangaOCR] Chargement du modèle manga-ocr…")
                try:
                    self._engine = await asyncio.to_thread(MangaOcr)
                except Exception as exc:
                    raise RuntimeError(
                        "manga-ocr n'a pas pu charger son modèle sur cette "
                        f"machine ({exc}) — le repli Tesseract prend le relais."
                    ) from exc
        return self._engine

    # ── Découpage en zones de texte (synchrone, exécuté en thread) ──────

    @staticmethod
    def _find_text_regions(image: Image.Image) -> list[tuple[int, int, int, int]]:
        """Boîtes candidates (x, y, w, h) par contours sur l'image binarisée.

        Ordre de lecture japonais vertical : colonnes de droite à gauche,
        puis de haut en bas dans chaque colonne approximative.
        """
        gray = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        # Relie les glyphes proches d'une même bulle/colonne.
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 17))
        dilated = cv2.dilate(binary, kernel, iterations=2)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        height, width = gray.shape
        regions: list[tuple[int, int, int, int]] = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w < 12 or h < 12 or w * h < 400:
                continue  # bruit, trames, filets
            if w > width * 0.98 and h > height * 0.98:
                continue  # page entière
            pad = 4
            regions.append(
                (
                    max(0, x - pad),
                    max(0, y - pad),
                    min(width, x + w + pad) - max(0, x - pad),
                    min(height, y + h + pad) - max(0, y - pad),
                )
            )
        # Lecture verticale : droite -> gauche, puis haut -> bas.
        regions.sort(key=lambda r: (-r[0], r[1]))
        # Chaque zone = une inférence transformer CPU (1-5 s) : sans
        # plafond, une page dense dépassait les 300 s du client.
        return regions[:60]

    def _recognize_sync(self, image_bytes: bytes, engine) -> list[OCRBlockData]:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        blocks: list[OCRBlockData] = []
        for x, y, w, h in self._find_text_regions(image):
            crop = image.crop((x, y, x + w, y + h))
            try:
                text = (engine(crop) or "").strip()
            except Exception as exc:  # un extrait illisible ne casse pas la page
                logger.warning("[MangaOCR] Extrait ignoré (%d,%d) : %s", x, y, exc)
                continue
            if not text or not any(ch.isalnum() for ch in text):
                continue
            confidence = _CONFIDENCE_FULL if w * h >= _SMALL_AREA_PX else _CONFIDENCE_SMALL
            blocks.append(
                OCRBlockData(
                    text=text,
                    bbox_x=x,
                    bbox_y=y,
                    bbox_w=w,
                    bbox_h=h,
                    confidence=confidence,
                    provider=PROVIDER_NAME,
                )
            )
        return blocks

    async def detect_text(
        self, image_bytes: bytes, source_lang: str = "ja"
    ) -> list[OCRBlockData]:
        """Reconnaît le texte japonais (vertical/furigana) d'une page."""
        if not image_bytes:
            return []
        engine = await self._get_engine()
        return await asyncio.to_thread(self._recognize_sync, image_bytes, engine)
