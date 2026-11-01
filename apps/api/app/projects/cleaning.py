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


def _glyph_components(binary: np.ndarray, gray: np.ndarray, *, bright: bool) -> np.ndarray:
    """Ne garde que les composantes de la taille d'un glyphe de texte.

    Le contour d'une bulle, ses rayons ou un aplat de dessin forment de
    grandes composantes : ils sont exclus, donc jamais effacés. Un
    glyphe sombre doit reposer sur un fond plutôt clair (bulle), un
    glyphe clair sur un fond plutôt sombre (narration inversée).
    """
    crop_h, crop_w = binary.shape
    max_w = max(90, int(crop_w * 0.22))
    max_h = max(90, int(crop_h * 0.35))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    out = np.zeros_like(binary)
    for comp in range(1, count):
        x, y, w, h, area = (int(v) for v in stats[comp])
        if area < 8 or w < 2 or h < 3:
            continue
        if w > max_w or h > max_h or w >= 0.85 * crop_w or h >= 0.85 * crop_h:
            continue
        if max(w, h) > 45 and area / max(1, w * h) < 0.18:
            continue  # long trait fin : contour de bulle, rayon, filet
        ring = _ring_mean(gray, labels, comp, x, y, w, h)
        if bright and ring > 140:
            continue
        if not bright and ring < 90:
            continue
        out[labels == comp] = 255
    return out


def _background_estimate(gray_crop: np.ndarray) -> np.ndarray:
    """Fond local estimé (flou médian large) : le texte en est absent.

    Un trait de lettre est fin devant un noyau de 31 px : le médian le
    remplace par la couleur du fond qui l'entoure (blanc de bulle,
    texture lissée du dessin), ce qui sert à la fois à détecter les
    glyphes par écart et à les recouvrir sans fantôme.
    """
    h, w = gray_crop.shape
    k = 31 if min(h, w) >= 31 else (min(h, w) // 2 * 2 + 1)
    return cv2.medianBlur(gray_crop, max(3, k))


def _text_glyph_mask(gray_crop: np.ndarray) -> np.ndarray:
    """Masque des traits de texte, par écart au fond local estimé.

    Un seuillage fixe laissait subsister la lisière la plus claire des
    lettres (fantôme gris visible dans la bulle nettoyée). Tout pixel
    s'écartant du fond local de plus de 18 niveaux est candidat, puis
    seuls les composants de taille de glyphe sont conservés.
    """
    background = _background_estimate(gray_crop)
    gray_i = gray_crop.astype(np.int16)
    bg_i = background.astype(np.int16)
    dark = np.where(bg_i - gray_i > 18, 255, 0).astype(np.uint8)
    bright = np.where(gray_i - bg_i > 18, 255, 0).astype(np.uint8)
    mask = cv2.bitwise_or(
        _glyph_components(dark, gray_crop, bright=False),
        _glyph_components(bright, gray_crop, bright=True),
    )
    if np.any(mask):
        # Dilatation large (+8 px) : le texte manhwa projette un halo
        # clair (ombre/glow JPEG) bien au-delà du trait seuillé. À +1 px
        # il restait un fantôme lisible des lettres ; à +8 px, mesuré sur
        # page réelle, la bulle redevient blanche et le contour survit.
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        mask = cv2.dilate(mask, kernel, iterations=2)
    return mask


def clean_image(
    image_bytes: bytes,
    blocks: list[tuple[int, int, int, int]],
    enable_lama: bool = False,
) -> bytes:
    """Efface le texte des blocs et reconstruit le fond sous les glyphes.

    Seuls les traits des lettres sont masqués puis reconstruits par
    inpainting (Telea, ou LaMa si demandé) à partir des pixels voisins
    immédiats. L'ancien comportement — inpainting de tout le rectangle
    OCR — détruisait le fond dès que la boîte débordait sur le dessin
    (grands triangles de bavure, case repeinte) sans rien reconstruire.
    Le contour de la bulle et le dessin autour restent donc intacts.
    """
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Image illisible — format non supporté par OpenCV.")

    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    glyph_mask = np.zeros((height, width), dtype=np.uint8)
    block_masks: list[tuple[int, int, int, int, np.ndarray]] = []
    try:
        bubbles = detect_bubble_regions(image)
    except Exception:
        bubbles = []

    for x, y, w, h in blocks:
        # Zone de recherche élargie HORIZONTALEMENT seulement : une
        # boîte OCR trop étroite coupait des glyphes en pleine ligne
        # (信。 restés visibles). Verticalement, on reste près des
        # lignes détectées — un débordement proportionnel à la largeur
        # (248 px pour une ligne de titre) a effacé « Prologue », un
        # texte jamais détecté : perte de contenu inacceptable.
        pad_x = min(80, max(24, int(0.20 * w)))
        pad_y = min(28, max(10, int(0.15 * h)))
        x0, y0 = x - pad_x, y - pad_y
        x1, y1 = x + w + pad_x, y + h + pad_y
        cx, cy = x + w / 2, y + h / 2
        for region in bubbles:
            if region.x - 6 <= cx <= region.x + region.w + 6 and region.y - 6 <= cy <= region.y + region.h + 6:
                x0 = min(x0, region.x + 8)
                y0 = min(y0, region.y + 8)
                x1 = max(x1, region.x + region.w - 8)
                y1 = max(y1, region.y + region.h - 8)
                break
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(width, x1), min(height, y1)
        if x1 <= x0 or y1 <= y0:
            continue
        local = _text_glyph_mask(gray[y0:y1, x0:x1])
        if not np.any(local):
            logger.debug("[Cleaning] Aucun glyphe détecté dans (%d,%d,%d,%d)", x, y, w, h)
            continue
        glyph_mask[y0:y1, x0:x1] = cv2.bitwise_or(glyph_mask[y0:y1, x0:x1], local)
        block_masks.append((x0, y0, x1, y1, local))

    if not np.any(glyph_mask):
        success, encoded = cv2.imencode(".png", image)
        if not success:
            raise ValueError("Échec de l'encodage de l'image nettoyée.")
        return encoded.tobytes()

    cleaned = image.copy()
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

