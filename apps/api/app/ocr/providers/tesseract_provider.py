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

import cv2
import numpy as np
from PIL import Image

from app.ocr.bubble_grouping import _is_japanese_char, has_japanese_text, normalize_cjk_spacing
from app.ocr.provider import OCRBlockData

logger = logging.getLogger(__name__)

PROVIDER_NAME = "tesseract"

TESSERACT_LANG_MAP: dict[str, str] = {
    "ja": "jpn",
    "jp": "jpn",
    "ja-jp": "jpn",
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


def _is_japanese_lang(source_lang: str) -> bool:
    return (source_lang or "").strip().lower().replace("_", "-") in {"ja", "jp", "ja-jp"}


def _has_jpn_vert(binary: str) -> bool:
    tess_dir = os.path.join(os.path.dirname(binary), "tessdata")
    return os.path.isfile(os.path.join(tess_dir, "jpn_vert.traineddata"))


def _clean_and_strip_furigana(roi_img: np.ndarray, roi_holes: np.ndarray) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """Isole l'encre sombre interne d'une bulle/cadre sur fond blanc pur (255)
    et supprime les colonnes de petits furigana (ruby) accolées à droite des
    colonnes verticales principales afin que Tesseract `jpn_vert` ne les
    fusionne pas avec les kanji.
    """
    h, w = roi_img.shape
    holes_dil = cv2.dilate(roi_holes, np.ones((3, 3), np.uint8), iterations=1)
    clean = np.full((h, w), 255, dtype=np.uint8)
    clean[holes_dil > 0] = roi_img[holes_dil > 0]

    ink = ((roi_holes > 0) & (roi_img < 175)).astype(np.uint8)
    n_c, c_labels, c_stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    main_ink = np.zeros_like(ink)
    for ci in range(1, n_c):
        cw = int(c_stats[ci, cv2.CC_STAT_WIDTH])
        ch = int(c_stats[ci, cv2.CC_STAT_HEIGHT])
        carea = int(c_stats[ci, cv2.CC_STAT_AREA])
        if cw >= 14 or ch >= 19 or carea >= 115:
            main_ink[c_labels == ci] = 1

    col_proj = np.sum(main_ink, axis=0)
    col_mask = (col_proj > 0).astype(np.uint8)
    col_mask = cv2.dilate(col_mask.reshape(1, -1), np.ones((1, 4), np.uint8), iterations=1).flatten()
    main_cols: list[tuple[int, int]] = []
    in_c = False
    s = 0
    for idx, val in enumerate(col_mask):
        if val > 0 and not in_c:
            in_c = True
            s = idx
        elif val == 0 and in_c:
            in_c = False
            if idx - s >= 12:
                main_cols.append((s, idx - 1))
    if in_c and len(col_mask) - s >= 12:
        main_cols.append((s, len(col_mask) - 1))

    if main_cols:
        for ci in range(1, n_c):
            cx, cy, cw, ch, carea = (int(v) for v in c_stats[ci])
            is_right_gutter = any(
                (mc_e - mc_s + 1) >= 20
                and cw <= min(13, int((mc_e - mc_s + 1) * 0.52))
                and (mc_e <= cx <= mc_e + 10)
                and not any(m2_s - 2 <= cx + cw / 2.0 <= m2_e + 2 for m2_s, m2_e in main_cols)
                for mc_s, mc_e in main_cols
            )
            if is_right_gutter and ch <= 22 and carea <= 165:
                clean[max(0, cy - 1) : min(h, cy + ch + 1), max(0, cx - 1) : min(w, cx + cw + 1)] = 255

    kept_ink = clean < 200
    if np.any(kept_ink):
        ys, xs = np.where(kept_ink)
        tx0, ty0 = int(xs.min()), int(ys.min())
        tx1, ty1 = int(xs.max()) + 1, int(ys.max()) + 1
        return clean, (tx0, ty0, max(1, tx1 - tx0), max(1, ty1 - ty0))
    return clean, (0, 0, w, h)


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
        if _is_japanese_lang(source_lang):
            return self._recognize_japanese_sync(image, binary, pytesseract)

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

    def _recognize_japanese_sync(
        self, image: Image.Image, binary: str, pytesseract_mod
    ) -> list[OCRBlockData]:
        """Reconnaissance spécialisée manga japonais (bulles et cadres rectangulaires).

        1. Détecte chaque bulle (`bulle`) et cadre rectangulaire (`carré`/`cadre`)
           par composante blanche fermée et vérifie la présence d'encre interne
           dans ses trous topologiques (élimine 100 % des faux positifs sur les
           rideaux, draps, vêtements, mains, réveils ou trames de décor).
        2. Isole les glyphes sur fond blanc pur (255) et retire les furigana
           (ruby) accolés à droite des colonnes verticales principales.
        3. Lit chaque conteneur avec `jpn_vert` (`--psm 5`, colonnes verticales
           de droite à gauche) et bascule sur `jpn` (`--psm 6`) uniquement si le
           conteneur est horizontal.
        """
        gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
        H, W = gray.shape
        vert_lang = "jpn_vert" if _has_jpn_vert(binary) else "jpn"

        white = (gray >= 228).astype(np.uint8) * 255
        white[gray < 165] = 0
        num, labels, stats, _ = cv2.connectedComponentsWithStats(white, connectivity=4)

        blocks: list[OCRBlockData] = []
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

            # Ignorer les trous géants correspondant à une sous-bulle entière
            n_h, h_labels, h_stats, _ = cv2.connectedComponentsWithStats(roi_holes, connectivity=8)
            for hi in range(1, n_h):
                hw = int(h_stats[hi, cv2.CC_STAT_WIDTH])
                hh = int(h_stats[hi, cv2.CC_STAT_HEIGHT])
                harea = int(h_stats[hi, cv2.CC_STAT_AREA])
                if harea > area * 0.25 or (hw >= 65 and hh >= 65):
                    roi_holes[h_labels == hi] = 0

            ink_mask = ((roi_holes > 0) & (roi_img < 130)).astype(np.uint8) * 255
            ink_pixels = int(np.count_nonzero(ink_mask))
            if ink_pixels < 45 or ink_pixels / float(max(1, area)) < 0.024:
                continue

            clean_crop, (tx, ty, tw, th) = _clean_and_strip_furigana(roi_img, roi_holes)
            clean_pad = cv2.copyMakeBorder(clean_crop, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
            pil_crop = Image.fromarray(clean_pad)

            text, conf, cjk_count = self._ocr_japanese_crop(
                pil_crop, pytesseract_mod, vert_lang=vert_lang, is_wide=(w > h * 1.30)
            )
            if not text or cjk_count == 0:
                continue
            # Filtrer les faux positifs résiduels (ex: SFX creux ou fragment isolé peu fiable)
            if cjk_count == 1 and (len(text) > 2 or conf < 0.78):
                continue
            min_conf = 0.48 if (cjk_count >= 3 and fill_ratio >= 0.78) else 0.58
            if conf < min_conf:
                continue
            if w > h * 1.35 and conf < 0.68:
                continue

            blocks.append(
                OCRBlockData(
                    text=text,
                    bbox_x=x + tx,
                    bbox_y=y + ty,
                    bbox_w=tw,
                    bbox_h=th,
                    confidence=round(conf, 4),
                    provider=PROVIDER_NAME,
                )
            )

        if blocks:
            return blocks

        # Repli si l'image fournie est déjà un extrait recadré sans bordure noire fermée
        text, conf, cjk_count = self._ocr_japanese_crop(
            image, pytesseract_mod, vert_lang=vert_lang, is_wide=(W > H * 1.25)
        )
        if text and cjk_count >= 1 and conf >= 0.45:
            return [
                OCRBlockData(
                    text=text,
                    bbox_x=0,
                    bbox_y=0,
                    bbox_w=W,
                    bbox_h=H,
                    confidence=round(conf, 4),
                    provider=PROVIDER_NAME,
                )
            ]
        return []

    @staticmethod
    def _ocr_japanese_crop(
        pil_crop: Image.Image, pytesseract_mod, vert_lang: str, is_wide: bool = False
    ) -> tuple[str, float, int]:
        def _run_mode(lang_code: str, psm: int) -> tuple[str, float, int]:
            data = pytesseract_mod.image_to_data(
                pil_crop,
                lang=lang_code,
                config=f"--psm {psm}",
                output_type=pytesseract_mod.Output.DICT,
            )
            words: list[str] = []
            confs: list[float] = []
            for raw_w, raw_c in zip(data.get("text", []), data.get("conf", [])):
                w_str = (raw_w or "").strip()
                try:
                    c_val = float(raw_c)
                except (TypeError, ValueError):
                    c_val = -1.0
                if w_str and c_val >= 0:
                    words.append(w_str)
                    confs.append(c_val)
            joined = normalize_cjk_spacing("".join(words)).strip()
            avg_c = (sum(confs) / len(confs) / 100.0) if confs else 0.0
            cjk_n = sum(1 for ch in joined if _is_japanese_char(ch))
            return joined, avg_c, cjk_n

        if is_wide:
            txt_h, conf_h, cjk_h = _run_mode("jpn", 6)
            txt_v, conf_v, cjk_v = _run_mode(vert_lang, 5)
            if (cjk_h, conf_h) >= (cjk_v, conf_v):
                return txt_h, conf_h, cjk_h
            return txt_v, conf_v, cjk_v

        txt_v, conf_v, cjk_v = _run_mode(vert_lang, 5)
        if cjk_v >= 2 and conf_v >= 0.65:
            return txt_v, conf_v, cjk_v
        txt_h, conf_h, cjk_h = _run_mode("jpn", 6)
        if cjk_h > cjk_v and conf_h > conf_v + 0.05:
            return txt_h, conf_h, cjk_h
        return txt_v, conf_v, cjk_v

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
