"""Cleaning intelligent : efface le texte détecté par l'OCR et reconstruit
le fond (inpainting) avec préservation de la netteté et LaMa ONNX.

Architecture :
1. Masque limité aux seuls glyphes du texte dans chaque boîte OCR
   (composantes connexes de taille de lettre ; le contour de bulle et
   les aplats du dessin, grandes composantes, sont exclus).
2. Reconstruction du fond sous ces traits fins par inpainting Telea
   à partir des pixels voisins (LaMa ONNX si ``enable_lama``).
Ne jamais inpainting-er un rectangle entier : sur une boîte débordant
sur le dessin, Telea barbouille toute la zone sans la reconstruire.
"""

import logging
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from app.ocr.bubble_grouping import detect_bubble_regions

logger = logging.getLogger(__name__)

# Marge ajoutée autour de chaque bounding box OCR en pixels
MASK_PADDING = 3

MODEL_PATH = Path(__file__).resolve().parent.parent.parent / "models" / "lama-manga.onnx"
_lama_session = None


def get_lama_session():
    global _lama_session
    if _lama_session is None and MODEL_PATH.exists():
        try:
            import onnxruntime as ort

            # Optimisation CPU : 2 threads suffisent sans saturer la machine
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 4
            _lama_session = ort.InferenceSession(
                str(MODEL_PATH), sess_options=opts, providers=["CPUExecutionProvider"]
            )
            logger.info("Modèle LaMa Manga ONNX chargé avec succès.")
        except Exception as exc:
            logger.warning("Impossible d'initialiser LaMa ONNX: %s", exc)
    return _lama_session


def _inpaint_lama(crop_bgr: np.ndarray, crop_mask: np.ndarray) -> np.ndarray:
    """Exécute l'inpainting neuronal LaMa sur un extrait recadré."""
    session = get_lama_session()
    if session is None:
        raise RuntimeError("Session LaMa non disponible.")

    orig_h, orig_w = crop_bgr.shape[:2]

    # Redimensionnement vers 512x512 pour le modèle
    resized_bgr = cv2.resize(crop_bgr, (512, 512), interpolation=cv2.INTER_AREA)
    resized_mask = cv2.resize(crop_mask, (512, 512), interpolation=cv2.INTER_NEAREST)

    # Conversion en RGB et normalisation [0, 1]
    rgb = cv2.cvtColor(resized_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    img_tensor = np.transpose(rgb, (2, 0, 1))[np.newaxis, ...].astype(np.float32)

    # Masque normalisé [0, 1]
    mask_tensor = (resized_mask > 127).astype(np.float32)[np.newaxis, np.newaxis, ...]

    # Inférence
    outputs = session.run(["output"], {"image": img_tensor, "mask": mask_tensor})
    out = outputs[0][0]  # shape (3, 512, 512)

    # Dé-normalisation et reconversion BGR
    out_rgb = np.transpose(out, (1, 2, 0))
    out_rgb = np.clip(out_rgb * 255.0, 0, 255).astype(np.uint8)
    out_bgr = cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)

    # Redimensionnement vers la taille originale du crop
    res = cv2.resize(out_bgr, (orig_w, orig_h), interpolation=cv2.INTER_LANCZOS4)
    return res


def _ring_mean(gray: np.ndarray, labels: np.ndarray, comp: int,
               x: int, y: int, w: int, h: int) -> float:
    """Niveau moyen de l'anneau entourant une composante (dans son crop)."""
    pad = 4
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(gray.shape[1], x + w + pad), min(gray.shape[0], y + h + pad)
    ring = gray[y0:y1, x0:x1][labels[y0:y1, x0:x1] != comp]
    return float(ring.mean()) if ring.size else 0.0


def _glyph_components(
    binary: np.ndarray,
    gray: np.ndarray,
    *,
    bright: bool,
    reject_border_touch: bool = True,
) -> np.ndarray:
    """Ne garde que les composantes de la taille d'un glyphe de texte.

    Le contour d'une bulle, ses rayons ou un aplat de dessin forment de
    grandes composantes ou traversent le bord de la fenêtre : ils sont
    exclus, donc jamais effacés. Un glyphe sombre doit reposer sur un fond
    plutôt clair (bulle), un glyphe clair sur un fond plutôt sombre
    (narration inversée).
    """
    crop_h, crop_w = binary.shape
    max_w = max(120, int(crop_w * 0.30))
    max_h = max(140, int(crop_h * 0.88))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    out = np.zeros_like(binary)
    for comp in range(1, count):
        x, y, w, h, area = (int(v) for v in stats[comp])
        if area < 8 or w < 2 or h < 3:
            continue
        if reject_border_touch and (
            x <= 1 or y <= 1 or x + w >= crop_w - 1 or y + h >= crop_h - 1
        ):
            continue  # trait entrant depuis l'extérieur du bloc (contour de bulle, décor)
        if w > max_w or h > max_h or w >= 0.85 * crop_w or h >= 0.92 * crop_h:
            continue
        if max(w, h) > 45 and area / max(1, w * h) < 0.16:
            continue  # long trait fin : contour de bulle, rayon, filet
        ring = _ring_mean(gray, labels, comp, x, y, w, h)
        if bright and ring > 140:
            continue
        if not bright and ring < 90:
            continue
        # Remplir les éventuels micro-trous internes d'un trait épais (ex: lettrage gras)
        comp_slice = (labels[y : y + h, x : x + w] == comp).astype(np.uint8) * 255
        out[y : y + h, x : x + w] = cv2.bitwise_or(out[y : y + h, x : x + w], comp_slice)
    return out


def _reconstruct_bubble_interior(
    bgr_crop: np.ndarray,
    glyph_mask: np.ndarray,
    clean_bg_mask: np.ndarray,
) -> np.ndarray:
    """Reconstruit le fond d'une bulle claire ligne par ligne à partir des
    pixels sains de la bulle situés de part et d'autre de chaque glyphe.

    Contrairement à Telea qui mélange verticalement et crée une ondulation
    sur les boîtes à dégradé ou à bande horizontale (ex: boîtes de titre
    bicolores), l'interpolation horizontale par ligne conserve des
    transitions parfaitement droites et un blanc pur sans aucune tache.
    """
    result = bgr_crop.copy()
    h, w = glyph_mask.shape
    for y in range(h):
        row_mask = glyph_mask[y]
        if not np.any(row_mask):
            continue
        xs = np.where(row_mask > 0)[0]
        if xs.size == 0:
            continue
        # Découper en segments horizontaux contigus [x0, x1]
        splits = np.where(np.diff(xs) > 1)[0] + 1
        runs = np.split(xs, splits)
        row_clean = np.where(clean_bg_mask[y] > 0)[0]

        for run in runs:
            rx0, rx1 = int(run[0]), int(run[-1])
            left_xs = row_clean[(row_clean < rx0) & (row_clean >= max(0, rx0 - 12))]
            right_xs = row_clean[(row_clean > rx1) & (row_clean <= min(w - 1, rx1 + 12))]

            if left_xs.size == 0 and right_xs.size == 0:
                # Repli sur une petite bande verticale voisine
                y0, y1 = max(0, y - 3), min(h, y + 4)
                x0, x1 = max(0, rx0 - 8), min(w, rx1 + 9)
                sub_clean = clean_bg_mask[y0:y1, x0:x1] > 0
                if np.any(sub_clean):
                    med = np.median(bgr_crop[y0:y1, x0:x1][sub_clean], axis=0).astype(np.uint8)
                    result[y, rx0 : rx1 + 1] = med
                continue

            if left_xs.size > 0:
                left_color = np.median(bgr_crop[y, left_xs], axis=0).astype(np.float32)
            else:
                left_color = np.median(bgr_crop[y, right_xs], axis=0).astype(np.float32)

            if right_xs.size > 0:
                right_color = np.median(bgr_crop[y, right_xs], axis=0).astype(np.float32)
            else:
                right_color = left_color

            span = max(1, rx1 - rx0 + 1)
            alphas = np.linspace(0.0, 1.0, span, dtype=np.float32)[:, np.newaxis]
            interp = (left_color * (1.0 - alphas) + right_color * alphas).round().astype(np.uint8)
            result[y, rx0 : rx1 + 1] = interp

    return result


def _safe_container_interior_mask(
    gray_crop: np.ndarray,
    bgr_crop: Optional[np.ndarray],
    inner_rect: tuple[int, int, int, int],
) -> Optional[tuple[np.ndarray, bool]]:
    """Si le bloc OCR est dans une bulle claire ou un cartouche sombre,
    retourne (masque_strict_intérieur, is_dark_container) avec une marge de
    sécurité de 2 px avant le liseré ou contour extérieur, afin de ne jamais
    effacer le contour ni les coins extérieurs d'une bulle ovale ou boîte.
    """
    crop_h, crop_w = gray_crop.shape
    ix0, iy0, ix1, iy1 = inner_rect
    ix0, iy0 = max(0, ix0), max(0, iy0)
    ix1, iy1 = min(crop_w, ix1), min(crop_h, iy1)
    if ix1 <= ix0 or iy1 <= iy0:
        return None

    if bgr_crop is not None and bgr_crop.ndim == 3:
        spread = bgr_crop.max(axis=2).astype(np.int16) - bgr_crop.min(axis=2).astype(np.int16)
        white_bg = ((gray_crop >= 200) & (spread <= 35)).astype(np.uint8) * 255
        dark_bg = ((gray_crop <= 55) & (spread <= 25)).astype(np.uint8) * 255
    else:
        white_bg = (gray_crop >= 200).astype(np.uint8) * 255
        dark_bg = (gray_crop <= 55).astype(np.uint8) * 255

    inner_white = white_bg[iy0:iy1, ix0:ix1]
    inner_dark = dark_bg[iy0:iy1, ix0:ix1]

    is_dark = False
    if inner_white.size > 0 and float(np.count_nonzero(inner_white)) / float(inner_white.size) >= 0.45:
        target_bg = white_bg
    elif inner_dark.size > 0 and float(np.count_nonzero(inner_dark)) / float(inner_dark.size) >= 0.45:
        target_bg = dark_bg
        is_dark = True
    else:
        return None

    # Couper les ponts d'1 px éventuels à travers un liseré fin.
    k3 = np.ones((3, 3), dtype=np.uint8)
    opened = cv2.morphologyEx(target_bg, cv2.MORPH_OPEN, k3)

    # Seules les composantes qui passent par le cœur central de la
    # boîte appartiennent au fond du conteneur.
    iw = max(1, ix1 - ix0)
    ih = max(1, iy1 - iy0)
    cx0 = ix0 + int(0.22 * iw)
    cx1 = max(cx0 + 1, ix1 - int(0.22 * iw))
    cy0 = iy0 + int(0.22 * ih)
    cy1 = max(cy0 + 1, iy1 - int(0.22 * ih))

    count, labels, _stats, _ = cv2.connectedComponentsWithStats(opened, 4)
    container_bg = np.zeros_like(target_bg)
    core_labels = labels[cy0:cy1, cx0:cx1]
    for comp in range(1, count):
        if np.count_nonzero(core_labels == comp) >= 8:
            container_bg[labels == comp] = 255

    if not np.any(container_bg):
        return None

    # Par inondation depuis le bord extérieur du crop sur container_bg,
    # tout ce qui est atteignable sans traverser le fond constitue le contour
    # et le décor extérieur. Les trous fermés à l'intérieur sont exclusivement
    # les glyphes de texte.
    padded = np.pad(container_bg, 1, constant_values=0)
    ff = padded.copy()
    ff_mask = np.zeros((crop_h + 4, crop_w + 4), dtype=np.uint8)
    cv2.floodFill(ff, ff_mask, (0, 0), 128)
    container_interior = np.where(ff[1:-1, 1:-1] != 128, 255, 0).astype(np.uint8)

    # Si le conteneur est ouvert sur un bord du crop, exclure toute composante
    # non-fond qui touche le bord du crop.
    non_bg = cv2.bitwise_not(container_bg)
    nw_count, nw_labels, nw_stats, _ = cv2.connectedComponentsWithStats(non_bg, 8)
    for comp in range(1, nw_count):
        x, y, w, h, _area = (int(v) for v in nw_stats[comp])
        touches_border = x <= 1 or y <= 1 or x + w >= crop_w - 1 or y + h >= crop_h - 1
        overlaps_inner = not (x + w <= ix0 or x >= ix1 or y + h <= iy0 or y >= iy1)
        if touches_border or not overlaps_inner:
            container_interior[nw_labels == comp] = 0

    safety_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    return cv2.erode(container_interior, safety_kernel, iterations=1), is_dark


def _safe_bubble_interior_mask(
    gray_crop: np.ndarray,
    bgr_crop: Optional[np.ndarray],
    inner_rect: tuple[int, int, int, int],
) -> Optional[np.ndarray]:
    """Rétro-compatibilité : retourne le masque strict pour une bulle claire."""
    res = _safe_container_interior_mask(gray_crop, bgr_crop, inner_rect)
    if res is not None and not res[1]:
        return res[0]
    return None


def _background_estimate(gray_crop: np.ndarray) -> np.ndarray:
    """Fond local estimé : fermeture ou ouverture morphologique selon la polarité,
    suivie d'un flou médian.

    - Sur fond clair (bulle classique) : fermeture morphologique pour effacer
      les traits sombres de texte sans laisser d'ombres.
    - Sur fond sombre (cartouche de narration manhwa, texte chinois/coréen blanc sur noir) :
      ouverture morphologique pour effacer les traits clairs de texte sans dilater le blanc.
    """
    h, w = gray_crop.shape
    border_pixels = np.concatenate([
        gray_crop[0, :],
        gray_crop[-1, :],
        gray_crop[:, 0],
        gray_crop[:, -1],
    ])
    bg_val = float(np.median(border_pixels)) if border_pixels.size > 0 else float(np.median(gray_crop))

    morph_k = min(45, max(15, (min(h, w) // 4) | 1))
    se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (morph_k, morph_k))

    if bg_val < 110:
        # Fond sombre : éliminer les glyphes clairs par ouverture morphologique
        filtered = cv2.morphologyEx(gray_crop, cv2.MORPH_OPEN, se)
    elif bg_val > 145:
        # Fond clair : éliminer les traits sombres par fermeture morphologique
        filtered = cv2.morphologyEx(gray_crop, cv2.MORPH_CLOSE, se)
    else:
        # Demi-teinte : combiner ouverture puis fermeture
        opened = cv2.morphologyEx(gray_crop, cv2.MORPH_OPEN, se)
        filtered = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, se)

    k = 31 if min(h, w) >= 31 else (min(h, w) // 2 * 2 + 1)
    return cv2.medianBlur(filtered, max(3, k))


def _text_glyph_mask(
    gray_crop: np.ndarray,
    bgr_crop: Optional[np.ndarray] = None,
    inner_rect: Optional[tuple[int, int, int, int]] = None,
) -> np.ndarray:
    """Masque des traits de texte, par écart au fond local estimé.

    Confiné à l'intérieur strict de la bulle ou du cartouche lorsqu'il est détecté,
    et protégé contre tout débordement sur les structures non-glyphes
    (contour noir de la bulle, décor extérieur).
    """
    crop_h, crop_w = gray_crop.shape
    if inner_rect is None:
        inner_rect = (4, 4, max(5, crop_w - 4), max(5, crop_h - 4))

    container_res = _safe_container_interior_mask(gray_crop, bgr_crop, inner_rect)

    background = _background_estimate(gray_crop)
    gray_i = gray_crop.astype(np.int16)
    bg_i = background.astype(np.int16)
    dark = np.where(bg_i - gray_i > 18, 255, 0).astype(np.uint8)
    bright = np.where(gray_i - bg_i > 18, 255, 0).astype(np.uint8)

    if container_res is not None:
        safe_interior, is_dark = container_res
        if not is_dark:
            # Bulle claire vérifiée : tout pixel sombre est du texte
            candidates = cv2.bitwise_or(
                dark,
                np.where(gray_crop < 210, 255, 0).astype(np.uint8),
            )
            raw_glyphs = _glyph_components(candidates, gray_crop, bright=False, reject_border_touch=True)
        else:
            # Cartouche sombre vérifié : tout pixel clair est du texte (idéogrammes chinois/coréens)
            candidates = cv2.bitwise_or(
                bright,
                np.where(gray_crop > 80, 255, 0).astype(np.uint8),
            )
            raw_glyphs = _glyph_components(candidates, gray_crop, bright=True, reject_border_touch=True)

        raw_glyphs = cv2.bitwise_and(raw_glyphs, safe_interior)
        non_glyph_structures = cv2.bitwise_and(
            candidates,
            cv2.bitwise_not(safe_interior),
        )
        if np.any(raw_glyphs):
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
            mask = cv2.dilate(raw_glyphs, kernel, iterations=2)
            mask = cv2.bitwise_and(mask, safe_interior)
            if np.any(non_glyph_structures):
                guard = cv2.dilate(
                    non_glyph_structures,
                    cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
                    iterations=1,
                )
                mask = cv2.bitwise_and(mask, cv2.bitwise_not(guard))
            return mask
        return raw_glyphs

    raw_dark = _glyph_components(dark, gray_crop, bright=False, reject_border_touch=True)
    raw_bright = _glyph_components(bright, gray_crop, bright=True, reject_border_touch=True)
    raw_glyphs = cv2.bitwise_or(raw_dark, raw_bright)
    all_candidates = cv2.bitwise_or(dark, bright)
    non_glyph_structures = cv2.bitwise_and(all_candidates, cv2.bitwise_not(raw_glyphs))
    if np.any(raw_glyphs):
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.dilate(raw_glyphs, kernel, iterations=1)
        if np.any(non_glyph_structures):
            guard = cv2.dilate(
                non_glyph_structures,
                cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
                iterations=1,
            )
            mask = cv2.bitwise_and(mask, cv2.bitwise_not(guard))
        return mask
    return raw_glyphs


def clean_image(
    image_bytes: bytes,
    blocks: list[tuple[int, int, int, int]],
    enable_lama: bool = False,
) -> bytes:
    """Efface le texte des blocs et reconstruit le fond sous les glyphes.

    1. Pour les bulles et cartouches clairs fermés : détection topologique
       exacte des trous internes de la composante blanche (100 % du texte,
       même très épais comme « NOAH SIMYANG », 0 % du contour noir et 0 %
       du décor extérieur), suivie d'une reconstruction ligne par ligne
       sans aucune tache ni ondulation de dégradé.
    2. Pour le texte hors bulle (SFX, narration sombre, gouttière ouverte) :
       masque de glyphes confiné et inpainting Telea / LaMa.
    """
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Image illisible — format non supporté par OpenCV.")

    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cleaned = image.copy()

    # Pré-calcul des composantes blanches fermées (bulles et cartouches clairs)
    spread_full = image.max(axis=2).astype(np.int16) - image.min(axis=2).astype(np.int16)
    white_full = ((gray >= 200) & (spread_full <= 35)).astype(np.uint8) * 255
    num_white, white_labels, white_stats, _ = cv2.connectedComponentsWithStats(white_full, 4)

    # Pré-calcul des composantes sombres fermées (cartouches et bannières sombres)
    dark_full = ((gray <= 55) & (spread_full <= 25)).astype(np.uint8) * 255
    num_dark, dark_labels, dark_stats, _ = cv2.connectedComponentsWithStats(dark_full, 4)
    page_area = max(1, width * height)

    glyph_mask = np.zeros((height, width), dtype=np.uint8)
    block_masks: list[tuple[int, int, int, int, np.ndarray]] = []

    for x, y, w, h in blocks:
        # 1. Tenter le nettoyage topologique exact si le bloc est dans une bulle fermée
        cx0 = max(0, x + int(0.20 * w))
        cx1 = min(width, max(cx0 + 1, x + w - int(0.20 * w)))
        cy0 = max(0, y + int(0.20 * h))
        cy1 = min(height, max(cy0 + 1, y + h - int(0.20 * h)))

        matched_comp = None
        if cx1 > cx0 and cy1 > cy0:
            core_slice = white_labels[cy0:cy1, cx0:cx1]
            vals, counts = np.unique(core_slice[core_slice > 0], return_counts=True)
            if vals.size > 0:
                best_comp = int(vals[int(np.argmax(counts))])
                bx, by, bw, bh, b_area = (int(v) for v in white_stats[best_comp])
                if 500 <= b_area <= 0.45 * page_area and bh < 0.85 * height:
                    matched_comp = (best_comp, bx, by, bw, bh)

        if matched_comp is not None:
            comp_id, bx, by, bw, bh = matched_comp
            comp_mask = (white_labels[by : by + bh, bx : bx + bw] == comp_id).astype(np.uint8) * 255
            padded = np.pad(comp_mask, 1, constant_values=0)
            ff = padded.copy()
            ff_mask = np.zeros((bh + 4, bw + 4), dtype=np.uint8)
            cv2.floodFill(ff, ff_mask, (0, 0), 128)
            holes = (ff[1:-1, 1:-1] == 0).astype(np.uint8) * 255
            bubble_filled = (ff[1:-1, 1:-1] != 128).astype(np.uint8) * 255

            # Ne garder que les trous situés dans le voisinage du bloc OCR
            # (tolérance large de 60 px pour couvrir une boîte redimensionnée par l'utilisateur)
            rx0 = max(0, x - 60 - bx)
            ry0 = max(0, y - 40 - by)
            rx1 = min(bw, x + w + 60 - bx)
            ry1 = min(bh, y + h + 40 - by)
            h_count, h_labels, h_stats, _ = cv2.connectedComponentsWithStats(holes, 8)
            block_holes = np.zeros_like(holes)
            for hc in range(1, h_count):
                hx, hy, hw, hh, harea = (int(v) for v in h_stats[hc])
                if harea < 4:
                    continue
                overlaps = not (hx + hw < rx0 or hx > rx1 or hy + hh < ry0 or hy > ry1)
                if overlaps:
                    block_holes[h_labels == hc] = 255

            if np.any(block_holes):
                safe_interior = cv2.erode(
                    bubble_filled,
                    cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
                    iterations=1,
                )
                dilated_holes = cv2.dilate(
                    block_holes,
                    cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)),
                    iterations=2,
                )
                local_mask = cv2.bitwise_and(dilated_holes, safe_interior)
                clean_bg = cv2.bitwise_and(comp_mask, cv2.bitwise_not(local_mask))
                cleaned[by : by + bh, bx : bx + bw] = _reconstruct_bubble_interior(
                    cleaned[by : by + bh, bx : bx + bw],
                    local_mask,
                    clean_bg,
                )
                continue

        # 1.b Tenter le nettoyage topologique exact si le bloc est dans un cartouche sombre fermé
        matched_dark_comp = None
        if cx1 > cx0 and cy1 > cy0:
            core_slice_dark = dark_labels[cy0:cy1, cx0:cx1]
            d_vals, d_counts = np.unique(core_slice_dark[core_slice_dark > 0], return_counts=True)
            if d_vals.size > 0:
                best_d_comp = int(d_vals[int(np.argmax(d_counts))])
                bx, by, bw, bh, b_area = (int(v) for v in dark_stats[best_d_comp])
                if 500 <= b_area <= 0.45 * page_area and bh < 0.85 * height:
                    matched_dark_comp = (best_d_comp, bx, by, bw, bh)

        if matched_dark_comp is not None:
            comp_id, bx, by, bw, bh = matched_dark_comp
            comp_mask = (dark_labels[by : by + bh, bx : bx + bw] == comp_id).astype(np.uint8) * 255
            padded = np.pad(comp_mask, 1, constant_values=0)
            ff = padded.copy()
            ff_mask = np.zeros((bh + 4, bw + 4), dtype=np.uint8)
            cv2.floodFill(ff, ff_mask, (0, 0), 128)
            holes = (ff[1:-1, 1:-1] == 0).astype(np.uint8) * 255
            box_filled = (ff[1:-1, 1:-1] != 128).astype(np.uint8) * 255

            rx0 = max(0, x - 60 - bx)
            ry0 = max(0, y - 40 - by)
            rx1 = min(bw, x + w + 60 - bx)
            ry1 = min(bh, y + h + 40 - by)
            h_count, h_labels, h_stats, _ = cv2.connectedComponentsWithStats(holes, 8)
            block_holes = np.zeros_like(holes)
            for hc in range(1, h_count):
                hx, hy, hw, hh, harea = (int(v) for v in h_stats[hc])
                if harea < 4:
                    continue
                overlaps = not (hx + hw < rx0 or hx > rx1 or hy + hh < ry0 or hy > ry1)
                if overlaps:
                    block_holes[h_labels == hc] = 255

            if np.any(block_holes):
                safe_interior = cv2.erode(
                    box_filled,
                    cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
                    iterations=1,
                )
                dilated_holes = cv2.dilate(
                    block_holes,
                    cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)),
                    iterations=1,
                )
                local_mask = cv2.bitwise_and(dilated_holes, safe_interior)
                box_patch = cleaned[by : by + bh, bx : bx + bw]
                cleaned[by : by + bh, bx : bx + bw] = cv2.inpaint(
                    box_patch, local_mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA
                )
                continue

        # 2. Repli local pour le texte hors bulle fermée (gouttière ouverte, SFX, fond sombre)
        pad_x = min(28, max(12, int(0.12 * w)))
        pad_y = min(18, max(10, int(0.12 * h)))
        x0, y0 = max(0, x - pad_x), max(0, y - pad_y)
        x1, y1 = min(width, x + w + pad_x), min(height, y + h + pad_y)
        if x1 <= x0 or y1 <= y0:
            continue
        inner_rect = (
            max(0, x - x0),
            max(0, y - y0),
            min(x1 - x0, x + w - x0),
            min(y1 - y0, y + h - y0),
        )
        local = _text_glyph_mask(
            gray[y0:y1, x0:x1],
            image[y0:y1, x0:x1],
            inner_rect=inner_rect,
        )
        if not np.any(local):
            logger.debug("[Cleaning] Aucun glyphe détecté dans (%d,%d,%d,%d)", x, y, w, h)
            continue
        glyph_mask[y0:y1, x0:x1] = cv2.bitwise_or(glyph_mask[y0:y1, x0:x1], local)
        block_masks.append((x0, y0, x1, y1, local))

    if not np.any(glyph_mask):
        success, encoded = cv2.imencode(".png", cleaned)
        if not success:
            raise ValueError("Échec de l'encodage de l'image nettoyée.")
        return encoded.tobytes()

    remaining = glyph_mask.copy()
    if enable_lama and get_lama_session() is not None:
        for x0, y0, x1, y1, local in block_masks:
            try:
                pad = max(16, int(max(x1 - x0, y1 - y0) * 0.2))
                cx0, cy0 = max(0, x0 - pad), max(0, y0 - pad)
                cx1, cy1 = min(width, x1 + pad), min(height, y1 + pad)
                crop_mask = np.zeros((cy1 - cy0, cx1 - cx0), dtype=np.uint8)
                crop_mask[y0 - cy0 : y1 - cy0, x0 - cx0 : x1 - cx0] = local
                cleaned[cy0:cy1, cx0:cx1] = _inpaint_lama(cleaned[cy0:cy1, cx0:cx1], crop_mask)
                remaining[cy0:cy1, cx0:cx1][crop_mask > 0] = 0
            except Exception as exc:
                logger.debug("Repli Telea après échec LaMa: %s", exc)

    if np.any(remaining):
        cleaned = cv2.inpaint(cleaned, remaining, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

    success, encoded = cv2.imencode(".png", cleaned)
    if not success:
        raise ValueError("Échec de l'encodage de l'image nettoyée.")
    return encoded.tobytes()


def clean_bubble_at_click(
    image_bytes: bytes,
    click_x: int,
    click_y: int,
    known_bboxes: list[tuple[int, int, int, int]] | None = None,
) -> bytes:
    """Nettoyage intelligent 1-clic local pour une bulle au point (click_x, click_y).

    Utilisé en tant que moteur autonome ou comme fallback transparent et sans
    erreur lorsque les API d'IA externes (ex: Meta SAM) sont indisponibles.
    """
    # 1. Vérifier si le clic correspond à un bloc OCR existant
    if known_bboxes:
        margin = 15
        for x, y, w, h in known_bboxes:
            if (x - margin <= click_x <= x + w + margin) and (y - margin <= click_y <= y + h + margin):
                return clean_image(image_bytes, [(x, y, w, h)])

    # 2. Détection dynamique de la bulle par inondation locale (FloodFill)
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Image illisible par OpenCV.")

    height, width = image.shape[:2]
    cx = max(0, min(width - 1, click_x))
    cy = max(0, min(height - 1, click_y))

    # Masque pour floodFill (dimensions h+2, w+2 selon spécification OpenCV)
    mask = np.zeros((height + 2, width + 2), dtype=np.uint8)

    # Tolérance de variation de couleur pour couvrir la bulle sans déborder sur les contours d'encre
    diff = (35, 35, 35)
    flags = 4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY
    try:
        _, _, mask_out, rect = cv2.floodFill(
            image.copy(), mask, (cx, cy), (255, 255, 255), diff, diff, flags
        )
        # Extraire la composante inondée
        bubble_mask = mask_out[1 : height + 1, 1 : width + 1]
        area = np.count_nonzero(bubble_mask)
        max_allowed_area = (width * height) * 0.45  # Max 45% de la page

        if 50 < area < max_allowed_area:
            # Bulle valide : on n'efface que les glyphes dans son
            # rectangle (jamais toute la surface, fond préservé).
            rx, ry, rw, rh = (int(v) for v in rect)
            return clean_image(image_bytes, [(rx, ry, rw, rh)])
    except Exception as exc:
        logger.debug("[clean_bubble_at_click] Échec floodFill : %s", exc)

    # 3. Repli géométrique par boîte locale de 80x80 pixels autour du clic
    box_w = 80
    box_h = 60
    bx = max(0, cx - box_w // 2)
    by = max(0, cy - box_h // 2)
    bw = min(width - bx, box_w)
    bh = min(height - by, box_h)
    return clean_image(image_bytes, [(bx, by, bw, bh)])

