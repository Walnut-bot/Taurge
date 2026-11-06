"""OCR polyvalent : PaddleOCR (détection spatiale + reconnaissance).

Spécialisation : coréen, chinois (simplifié/traditionnel) et langues
occidentales (en, fr, es, pt, de...). PaddleOCR fournit nativement les
boîtes englobantes et un score de confiance par ligne, contrairement à
manga-ocr — d'où ce partage des rôles avec `MangaOCRProvider`.

Note PaddleOCR-VL : la variante VL (document VLM) vise la structure de
documents complets (titres, tableaux) et exige un serving VLM dédié ;
pour des bulles de manga, le pipeline PP-OCR de PaddleOCR (détection +
reconnaissance ligne à ligne) est plus rapide, local et donne
directement bbox + confiance. Ce provider utilise donc PP-OCR.

Les modèles sont chargés paresseusement, un par langue, dans un thread
(``asyncio.to_thread``) : aucun blocage de la boucle FastAPI.
"""

import asyncio
import io
import logging

import numpy as np
from PIL import Image

from app.ocr.provider import OCRBlockData

logger = logging.getLogger(__name__)

PROVIDER_NAME = "paddleocr"

# Code applicatif -> code de modèle PaddleOCR.
PADDLE_LANG_MAP: dict[str, str] = {
    "ko": "korean",
    "zh": "ch",
    "zh-hans": "ch",
    "zh-cn": "ch",
    "zh-hant": "chinese_cht",
    "zh-tw": "chinese_cht",
    "en": "en",
    "fr": "fr",
    "es": "es",
    "pt": "pt",
    "de": "german",
}

DEFAULT_PADDLE_LANG = "en"


def get_paddle_lang(source_lang: str) -> str:
    """Traduit un code applicatif en code de modèle PaddleOCR."""
    key = (source_lang or "").strip().lower()
    if key in PADDLE_LANG_MAP:
        return PADDLE_LANG_MAP[key]
    return PADDLE_LANG_MAP.get(key.replace("_", "-"), DEFAULT_PADDLE_LANG)


class PaddleOCRProvider:
    """Détection + reconnaissance PaddleOCR (KO, ZH, langues occidentales)."""

    def __init__(self) -> None:
        self._engines: dict[str, object] = {}
        self._engine_lock = asyncio.Lock()

    async def _get_engine(self, paddle_lang: str):
        """Charge (une fois par langue) le pipeline PaddleOCR, en thread."""
        if paddle_lang in self._engines:
            return self._engines[paddle_lang]
        async with self._engine_lock:
            if paddle_lang not in self._engines:
                try:
                    from paddleocr import PaddleOCR

                    logger.info("[PaddleOCR] Chargement du modèle lang=%s…", paddle_lang)
                    engine = await asyncio.to_thread(
                        PaddleOCR, lang=paddle_lang, use_angle_cls=True, show_log=False
                    )
                except Exception as exc:
                    # ImportError : paquet absent. NameError/OSError : la
                    # bibliothèque native `libpaddle` n'a pas pu se charger
                    # (build AVX sur un CPU sans AVX, DLL manquante…) —
                    # Paddle masque alors la vraie cause derrière un
                    # `NameError: name 'libpaddle' is not defined`.
                    raise RuntimeError(
                        "PaddleOCR indisponible sur cette machine "
                        f"(bibliothèque native libpaddle non chargée : {exc}). "
                        "Cause fréquente : PaddlePaddle compilé avec AVX sur un "
                        "processeur sans AVX — le repli Tesseract prend le relais."
                    ) from exc
                self._engines[paddle_lang] = engine
        return self._engines[paddle_lang]

    @staticmethod
    def _parse_result(result, width: int, height: int) -> list[OCRBlockData]:
        """Normalise la sortie PaddleOCR : [page][ligne] -> OCRBlockData.

        Chaque ligne : ``[box_points, (text, score)]`` où box_points sont
        les 4 coins (décimaux) du polygone détecté.
        """
        blocks: list[OCRBlockData] = []
        if not result:
            return blocks
        lines = result[0] if isinstance(result, list) else result
        if not lines:
            return blocks
        for line in lines:
            try:
                points, (text, score) = line
                text = (text or "").strip()
                if not text or not any(ch.isalnum() for ch in text):
                    continue
                xs = [float(p[0]) for p in points]
                ys = [float(p[1]) for p in points]
                x0 = max(0, min(int(min(xs)), width - 1))
                y0 = max(0, min(int(min(ys)), height - 1))
                x1 = max(x0 + 1, min(int(max(xs)), width))
                y1 = max(y0 + 1, min(int(max(ys)), height))
                blocks.append(
                    OCRBlockData(
                        text=text,
                        bbox_x=x0,
                        bbox_y=y0,
                        bbox_w=x1 - x0,
                        bbox_h=y1 - y0,
                        confidence=float(score),
                        provider=PROVIDER_NAME,
                    )
                )
            except (TypeError, ValueError, IndexError) as exc:
                logger.warning("[PaddleOCR] Ligne illisible ignorée : %s", exc)
                continue
        return blocks

    # Au-delà, la détection Paddle sur CPU prend des minutes (bandes
    # webtoon très hautes) : on réduit, les coordonnées sont ramenées
    # à l'échelle d'origine dans _parse_result via `scale`.
    MAX_OCR_DIMENSION = 2800

    def _recognize_sync(self, image_bytes: bytes, engine) -> list[OCRBlockData]:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        width, height = image.width, image.height
        scale = min(1.0, self.MAX_OCR_DIMENSION / max(width, height))
        if scale < 1.0:
            image = image.resize(
                (max(1, int(width * scale)), max(1, int(height * scale))),
                Image.LANCZOS,
            )
        result = engine.ocr(np.array(image), cls=True)
        blocks = self._parse_result(result, image.width, image.height)
        if scale < 1.0:
            for block in blocks:
                block.bbox_x = int(block.bbox_x / scale)
                block.bbox_y = int(block.bbox_y / scale)
                block.bbox_w = max(1, int(block.bbox_w / scale))
                block.bbox_h = max(1, int(block.bbox_h / scale))
        return blocks

    async def detect_text(
        self, image_bytes: bytes, source_lang: str
    ) -> list[OCRBlockData]:
        """Détecte et reconnaît le texte d'une page (hors japonais)."""
        if not image_bytes:
            return []
        engine = await self._get_engine(get_paddle_lang(source_lang))
        return await asyncio.to_thread(self._recognize_sync, image_bytes, engine)
