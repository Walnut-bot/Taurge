"""OCR de repli : Tesseract (binaire système + pytesseract).

Utilisé quand le moteur principal est indisponible sur la machine —
cas typique : PaddlePaddle compilé avec AVX sur un CPU qui n'en a pas
(Celeron/Pentium anciens), où `libpaddle` refuse de se charger
(``NameError: name 'libpaddle' is not defined`` côté PaddleOCR).

Tesseract est plus lent et moins précis sur les bulles verticales,
mais il fonctionne partout, sans instruction AVX. Le provider renvoie
le même format que les autres moteurs : `OCRBlockData` avec boîte
englobante et confiance, en regroupant les mots par ligne détectée.

Résolution du binaire, par ordre :
1. variable d'environnement `TESSERACT_CMD` ;
2. `tesseract` dans le PATH ;
3. chemin d'installation Windows par défaut.
"""

import asyncio
import io
import logging
import os
import shutil

from PIL import Image

from app.ocr.provider import OCRBlockData

logger = logging.getLogger(__name__)

PROVIDER_NAME = "tesseract"

TESSERACT_LANG_MAP: dict[str, str] = {
    "ja": "jpn",
    "ko": "kor",
    "zh": "chi_sim",
    "zh-hans": "chi_sim",
    "zh-cn": "chi_sim",
    "zh-hant": "chi_tra",
    "zh-tw": "chi_tra",
    "en": "eng",
    "fr": "fra",
    "es": "spa",
    "pt": "por",
    "de": "deu",
}

DEFAULT_TESSERACT_LANG = "eng"

_WINDOWS_DEFAULT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def get_tesseract_lang(source_lang: str) -> str:
    key = (source_lang or "").strip().lower()
    if key in TESSERACT_LANG_MAP:
        return TESSERACT_LANG_MAP[key]
    return TESSERACT_LANG_MAP.get(key.replace("_", "-"), DEFAULT_TESSERACT_LANG)


def find_tesseract_binary() -> str | None:
    configured = os.environ.get("TESSERACT_CMD")
    if configured and os.path.isfile(configured):
        return configured
    found = shutil.which("tesseract")
    if found:
        return found
    if os.path.isfile(_WINDOWS_DEFAULT):
        return _WINDOWS_DEFAULT
    return None


class TesseractOCRProvider:
    """Reconnaissance Tesseract (repli universel, sans AVX requis)."""

    def _recognize_sync(self, image_bytes: bytes, source_lang: str) -> list[OCRBlockData]:
        binary = find_tesseract_binary()
        if binary is None:
            raise RuntimeError(
                "Tesseract introuvable : installez Tesseract-OCR ou définissez "
                "la variable d'environnement TESSERACT_CMD."
            )
        try:
            import pytesseract
        except ImportError as exc:
            raise RuntimeError(
                "pytesseract n'est pas installé : `pip install pytesseract` "
                "(inclus dans requirements.txt)."
            ) from exc

        pytesseract.pytesseract.tesseract_cmd = binary
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        # Agrandissement x2 des pages étroites : à taille réelle, les
        # glyphes CJK (~50 px) sont mal lus (信 lu 人, 这 lu 文 sur la
        # page chinoise de référence) ; doublés, ils sont reconnus.
        # Plafond absolu : une bande webtoon de 1 200 x 12 000 doublée
        # faisait travailler Tesseract de longues minutes.
        scale = 2.0 if image.width < 2000 else 1.0
        scale = min(scale, 6000 / max(image.width, image.height))
        if max(image.width, image.height) * scale > 4000:
            scale = 4000 / max(image.width, image.height)
        if scale != 1.0:
            image = image.resize(
                (max(1, int(image.width * scale)), max(1, int(image.height * scale))),
                Image.LANCZOS,
            )
        # --psm 11 : texte épars (bulles dispersées sur une page de manga).
        data = pytesseract.image_to_data(
            image,
            lang=get_tesseract_lang(source_lang),
            config="--psm 11",
            output_type=pytesseract.Output.DICT,
        )
        return self._group_lines(data, scale=scale)

    @staticmethod
    def _group_lines(data: dict, scale: float = 1) -> list[OCRBlockData]:
        """Regroupe les mots Tesseract par ligne : (bloc, paragraphe, ligne).

        ``scale`` ramène les coordonnées de l'image agrandie dans le
        repère d'origine.
        """
        lines: dict[tuple, dict] = {}
        count = len(data.get("text", []))
        for i in range(count):
            text = (data["text"][i] or "").strip()
            try:
                confidence = float(data["conf"][i])
            except (TypeError, ValueError):
                confidence = -1.0
            if not text or confidence < 0:
                continue
            key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
            x, y = int(int(data["left"][i]) / scale), int(int(data["top"][i]) / scale)
            right = x + int(int(data["width"][i]) / scale)
            bottom = y + int(int(data["height"][i]) / scale)
            line = lines.setdefault(
                key,
                {"words": [], "x0": x, "y0": y, "x1": right, "y1": bottom, "confs": []},
            )
            line["words"].append(text)
            line["x0"], line["y0"] = min(line["x0"], x), min(line["y0"], y)
            line["x1"], line["y1"] = max(line["x1"], right), max(line["y1"], bottom)
            line["confs"].append(confidence)

        blocks: list[OCRBlockData] = []
        for line in lines.values():
            text = " ".join(line["words"]).strip()
            if not text or not any(ch.isalnum() for ch in text):
                continue
            blocks.append(
                OCRBlockData(
                    text=text,
                    bbox_x=line["x0"],
                    bbox_y=line["y0"],
                    bbox_w=max(1, line["x1"] - line["x0"]),
                    bbox_h=max(1, line["y1"] - line["y0"]),
                    confidence=sum(line["confs"]) / len(line["confs"]) / 100.0,
                    provider=PROVIDER_NAME,
                )
            )
        return blocks

    async def detect_text(
        self, image_bytes: bytes, source_lang: str
    ) -> list[OCRBlockData]:
        if not image_bytes:
            return []
        return await asyncio.to_thread(self._recognize_sync, image_bytes, source_lang)
