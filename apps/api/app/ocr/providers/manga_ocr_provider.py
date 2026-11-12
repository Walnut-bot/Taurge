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
        """Boîtes candidates (x, y, w, h) ciblant les bulles et cadres de narration.

        Utilise en priorité la détection topologique des bulles et cadres fermés
        (`detect_bubble_regions`) afin de n'extraire jamais de faux positifs sur
        les rideaux, draps ou vêtements du décor.
        """
        from app.ocr.bubble_grouping import detect_bubble_regions

        detected = detect_bubble_regions(image)
        if detected:
            regions = [(r.x, r.y, r.w, r.h) for r in detected]
            regions.sort(key=lambda r: (r[1] // 180, -r[0], r[1]))
            return regions[:60]

        gray = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        # Relie les glyphes proches d'une même bulle/colonne.
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 17))
        dilated = cv2.dilate(binary, kernel, iterations=2)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        height, width = gray.shape
        regions = []
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
        return regions[:60]

    @staticmethod
    def _extract_clean_containers(
        image: Image.Image,
    ) -> list[tuple[int, int, int, int, Image.Image]]:
        """Extrait chaque bulle (`bulle`) et cadre rectangulaire (`carré`/`cadre`)
        vérifié par topologie et renvoie `(bbox_x, bbox_y, bbox_w, bbox_h, clean_pil_crop)`
        où seuls les glyphes internes sont conservés sur un fond blanc pur (255),
        éliminant le contour noir et le décor extérieur dans les coins des bulles ovales.
        """
        gray = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
        H, W = gray.shape
        white = (gray >= 225).astype(np.uint8) * 255
        white[gray < 165] = 0
        num, labels, stats, _ = cv2.connectedComponentsWithStats(white, connectivity=4)

        containers: list[tuple[int, int, int, int, Image.Image]] = []
        for i in range(1, num):
            x, y, w, h, area = (int(v) for v in stats[i])
            if area < 1000 or w < 30 or h < 38:
                continue
            if w > W * 0.94 or h > H * 0.88:
                continue
            roi_img = gray[y : y + h, x : x + w]
            roi_comp = (labels[y : y + h, x : x + w] == i).astype(np.uint8) * 255
            bg_med = float(np.median(roi_img[roi_comp > 0])) if np.any(roi_comp > 0) else 0.0
            if bg_med < 240.0:
                continue

            padded = cv2.copyMakeBorder(roi_comp, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
            inv = cv2.bitwise_not(padded)
            ff = inv.copy()
            fmask = np.zeros((h + 4, w + 4), dtype=np.uint8)
            cv2.floodFill(ff, fmask, (0, 0), 0)
            roi_holes = ff[1:-1, 1:-1]
            filled = cv2.bitwise_or(roi_comp, roi_holes)
            fill_ratio = float(np.count_nonzero(filled)) / float(max(1, w * h))
            if fill_ratio < 0.72:
                continue

            n_h, h_labels, h_stats, _ = cv2.connectedComponentsWithStats(roi_holes, connectivity=8)
            for hi in range(1, n_h):
                hw = int(h_stats[hi, cv2.CC_STAT_WIDTH])
                hh = int(h_stats[hi, cv2.CC_STAT_HEIGHT])
                harea = int(h_stats[hi, cv2.CC_STAT_AREA])
                if harea > area * 0.25 or (hw >= 65 and hh >= 65):
                    roi_holes[h_labels == hi] = 0

            ink_mask = ((roi_holes > 0) & (roi_img < 135)).astype(np.uint8) * 255
            ink_pixels = int(np.count_nonzero(ink_mask))
            if ink_pixels < 45 or ink_pixels / float(max(1, area)) < 0.024:
                continue

            holes_dil = cv2.dilate(roi_holes, np.ones((3, 3), np.uint8), iterations=1)
            clean = np.full((h, w), 255, dtype=np.uint8)
            clean[holes_dil > 0] = roi_img[holes_dil > 0]

            ys, xs = np.where(ink_mask > 0)
            tx0, ty0 = int(xs.min()), int(ys.min())
            tx1, ty1 = int(xs.max()) + 1, int(ys.max()) + 1
            tw, th = max(1, tx1 - tx0), max(1, ty1 - ty0)

            clean_pad = cv2.copyMakeBorder(clean, 16, 16, 16, 16, cv2.BORDER_CONSTANT, value=255)
            pil_crop = Image.fromarray(clean_pad).convert("RGB")
            containers.append((x + tx0, y + ty0, tw, th, pil_crop))

        containers.sort(key=lambda r: (r[1] // 180, -r[0], r[1]))
        return containers[:60]

    def _recognize_sync(self, image_bytes: bytes, engine) -> list[OCRBlockData]:
        from app.ocr.bubble_grouping import has_japanese_text

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        blocks: list[OCRBlockData] = []
        containers = self._extract_clean_containers(image)
        if containers:
            for bx, by, bw, bh, pil_crop in containers:
                try:
                    text = (engine(pil_crop) or "").strip()
                except Exception as exc:
                    logger.warning("[MangaOCR] Extrait ignoré (%d,%d) : %s", bx, by, exc)
                    continue
                if not text or not has_japanese_text(text):
                    continue
                confidence = _CONFIDENCE_FULL if bw * bh >= _SMALL_AREA_PX else _CONFIDENCE_SMALL
                blocks.append(
                    OCRBlockData(
                        text=text,
                        bbox_x=bx,
                        bbox_y=by,
                        bbox_w=bw,
                        bbox_h=bh,
                        confidence=confidence,
                        provider=PROVIDER_NAME,
                    )
                )
            return blocks

        for x, y, w, h in self._find_text_regions(image):
            crop = image.crop((x, y, x + w, y + h))
            try:
                text = (engine(crop) or "").strip()
            except Exception as exc:  # un extrait illisible ne casse pas la page
                logger.warning("[MangaOCR] Extrait ignoré (%d,%d) : %s", x, y, exc)
                continue
            if not text or not has_japanese_text(text):
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
        if blocks:
            return blocks

        # Si l'image fournie est déjà un extrait recadré (ex: bulle dessinée
        # manuellement avec "+ Bubble"), on lit directement l'extrait entier.
        direct = self._recognize_crop_sync(image, engine)
        return [direct] if direct is not None else []

    @staticmethod
    def _recognize_crop_sync(image: Image.Image, engine) -> OCRBlockData | None:
        """Lit directement un extrait d'image recadré par l'utilisateur (+ Bubble)."""
        from app.ocr.bubble_grouping import has_japanese_text

        w, h = image.size
        if w < 8 or h < 8:
            return None

        # 1) Lecture directe sur l'extrait fourni
        candidates: list[str] = []
        try:
            raw_text = (engine(image) or "").strip()
            if raw_text and has_japanese_text(raw_text):
                candidates.append(raw_text)
        except Exception as exc:
            logger.warning("[MangaOCR] Lecture directe extrait échouée : %s", exc)

        # 2) Variante avec marge blanche de 16px (évite que les traits touchant
        # le bord du rectangle tracé par l'utilisateur ne soient tronqués).
        try:
            arr = np.array(image.convert("RGB"))
            padded = cv2.copyMakeBorder(
                arr, 16, 16, 16, 16, cv2.BORDER_CONSTANT, value=(255, 255, 255)
            )
            pad_text = (engine(Image.fromarray(padded)) or "").strip()
            if pad_text and has_japanese_text(pad_text):
                candidates.append(pad_text)
        except Exception:
            pass

        if not candidates:
            return None

        best_text = max(candidates, key=lambda t: len(t))
        confidence = _CONFIDENCE_FULL if w * h >= _SMALL_AREA_PX else _CONFIDENCE_SMALL
        return OCRBlockData(
            text=best_text,
            bbox_x=0,
            bbox_y=0,
            bbox_w=w,
            bbox_h=h,
            confidence=confidence,
            provider=PROVIDER_NAME,
        )

    async def recognize_crop(self, image_bytes: bytes) -> OCRBlockData | None:
        """Reconnaît directement une zone recadrée manuellement par l'utilisateur."""
        if not image_bytes:
            return None
        engine = await self._get_engine()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return await asyncio.to_thread(self._recognize_crop_sync, image, engine)

    async def detect_text(
        self, image_bytes: bytes, source_lang: str = "ja"
    ) -> list[OCRBlockData]:
        """Reconnaît le texte japonais (vertical/furigana) d'une page."""
        if not image_bytes:
            return []
        engine = await self._get_engine()
        return await asyncio.to_thread(self._recognize_sync, image_bytes, engine)
