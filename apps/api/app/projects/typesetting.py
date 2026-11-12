"""
Module de Typesetting Professionnel pour Manga / Manhwa / Webtoon.
Gère l'intégration typographique du texte traduit dans les bulles : 
1. Recherche itérative de la taille de police optimale (auto-fit) pour occuper harmonieusement l'espace sans déborder.
2. Découpage équilibré des lignes (balanced word-wrap).
3. Centrage vertical et horizontal parfait dans la bulle.
4. Rendu avec contour protecteur (stroke) pour assumer une lisiblité absolue.
5. Utilisation de polices orientées bandes déssinée  comics.
"""


import os
import urllib.request
import logging
from pathlib import Path
from PIL import ImageDraw, ImageFont

from app.core.config import settings

logger = logging.getLogger(__name__)

ASSETS_FONTS_DIR = settings.fonts_dir
ASSETS_FONTS_DIR.mkdir(parents=True, exist_ok=True)

# Fichiers de polices officielles Manhwa
FONTS_MANIFEST = {
    "dialogue": {
        "file": ASSETS_FONTS_DIR / "ComicNeue-Bold.ttf",
        "url": "https://raw.githubusercontent.com/google/fonts/main/ofl/comicneue/ComicNeue-Bold.ttf",
    },
    "scream": {
        "file": ASSETS_FONTS_DIR / "Bangers-Regular.ttf",
        "url": "https://raw.githubusercontent.com/google/fonts/main/ofl/bangers/Bangers-Regular.ttf",
    },
    "system": {
        "file": ASSETS_FONTS_DIR / "Cinzel-Bold.ttf",
        "url": "https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf",
    },
    "sfx": {
        "file": ASSETS_FONTS_DIR / "PermanentMarker-Regular.ttf",
        "url": "https://raw.githubusercontent.com/google/fonts/main/apache/permanentmarker/PermanentMarker-Regular.ttf",
    },
}


_download_failed_styles: set[str] = set()


def _ensure_font(style: str) -> str | None:
    """Télécharge à la volée la police manhwa appropriée si elle n'est pas encore présente."""
    entry = FONTS_MANIFEST.get(style, FONTS_MANIFEST["dialogue"])
    font_path = entry["file"]

    if font_path.exists():
        return str(font_path)

    if style in _download_failed_styles:
        return None

    try:
        logger.info("Téléchargement de la police Manhwa (%s)...", style)
        urllib.request.urlretrieve(entry["url"], str(font_path))
        logger.info("Police Manhwa installée : %s", font_path)
        return str(font_path)
    except Exception as exc:
        _download_failed_styles.add(style)
        logger.warning("Échec téléchargement police %s: %s", style, exc)
        return None


def _get_font(size: int, style: str = "dialogue") -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Charge la police exacte demandée selon le registre manhwa."""
    path = _ensure_font(style)
    if path and os.path.exists(path):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass

    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def wrap_text_diamond(text: str, font, max_w: int, max_h: int, draw: ImageDraw.ImageDraw) -> list[str]:
    """Découpe les mots en losange/ovale (Diamond Shape) pour épouser la courbure des bulles de manhwa."""
    words = text.split()
    if not words:
        return []

    lines = []
    current_line = []

    for word in words:
        candidate = " ".join(current_line + [word])
        bb = draw.textbbox((0, 0), candidate, font=font)
        cand_w = bb[2] - bb[0]

        if cand_w <= max_w:
            current_line.append(word)
        else:
            if current_line:
                lines.append(" ".join(current_line))
                current_line = [word]
            else:
                lines.append(word)
                current_line = []

    if current_line:
        lines.append(" ".join(current_line))

    return lines


def render_text_in_bubble(
    draw: ImageDraw.ImageDraw,
    text: str,
    bbox_x: int,
    bbox_y: int,
    bbox_w: int,
    bbox_h: int,
    style_type: str = "dialogue",
    uppercase: bool = True,
    text_color: tuple[int, int, int] = (15, 15, 15),
    stroke_color: tuple[int, int, int] = (255, 255, 255),
    stroke_width: int = 2,
    rotation_angle: int = 0,
    font_size_scale: float = 1.0,
    target_image: "Image.Image | None" = None,
) -> None:
    """Rend la réplique avec la typographie professionnelle Manhwa calibrée et support de la rotation."""
    if not text or not text.strip():
        return

    import math
    from PIL import Image

    clean_text = text.strip().upper() if uppercase else text.strip()
    angle = int(rotation_angle or 0)
    scale = float(font_size_scale or 1.0)

    # Si le texte est tourné autour de ±90°, on échange largeur et hauteur utiles
    # pour que la phrase s'étende sur le grand axe de la boîte verticale.
    is_sideways = abs(math.sin(math.radians(angle))) >= 0.707
    eff_w = bbox_h if is_sideways else bbox_w
    eff_h = bbox_w if is_sideways else bbox_h

    usable_w = max(24, int(eff_w * 0.82))
    usable_h = max(24, int(eff_h * 0.82))

    min_size = 11
    max_size = max(14, int(eff_h * 0.52))
    best_font = None
    best_lines = []
    best_size = min_size

    low = min_size
    high = max_size

    while low <= high:
        mid = (low + high) // 2
        test_font = _get_font(mid, style_type)
        lines = wrap_text_diamond(clean_text, test_font, usable_w, usable_h, draw)

        if not lines:
            break

        line_spacing = max(1, int(mid * 0.18))  # Interlignage serré scanlation
        total_text_h = sum(
            (draw.textbbox((0, 0), line, font=test_font)[3] - draw.textbbox((0, 0), line, font=test_font)[1]) + line_spacing
            for line in lines
        ) - line_spacing

        all_fit_w = all(
            (draw.textbbox((0, 0), line, font=test_font)[2] - draw.textbbox((0, 0), line, font=test_font)[0]) <= usable_w
            for line in lines
        )

        if total_text_h <= usable_h and all_fit_w:
            best_font = test_font
            best_lines = lines
            best_size = mid
            low = mid + 1
        else:
            high = mid - 1

    if scale != 1.0:
        best_size = max(min_size, min(160, int(round(best_size * scale))))
        best_font = _get_font(best_size, style_type)
        best_lines = wrap_text_diamond(clean_text, best_font, usable_w, usable_h, draw)
    elif best_font is None:
        best_font = _get_font(min_size, style_type)
        best_lines = wrap_text_diamond(clean_text, best_font, usable_w, usable_h, draw)

    line_metrics = []
    for line in best_lines:
        bb = draw.textbbox((0, 0), line, font=best_font)
        line_metrics.append((bb[2] - bb[0], bb[3] - bb[1]))

    line_spacing = max(1, int(best_size * 0.18))
    total_h = sum(m[1] + line_spacing for m in line_metrics) - line_spacing

    # Si angle != 0 et qu'on a accès à target_image, on dessine sur un calque RGBA qu'on tourne
    if angle != 0 and target_image is not None:
        layer_w = max(eff_w + 32, sum((m[0] for m in line_metrics), default=eff_w) + 32)
        layer_h = max(eff_h + 32, total_h + 32)
        layer = Image.new("RGBA", (layer_w, layer_h), (0, 0, 0, 0))
        ldraw = ImageDraw.Draw(layer)
        ly = max(0, (layer_h - total_h) // 2)
        for line, (lw, lh) in zip(best_lines, line_metrics):
            lx = max(0, (layer_w - lw) // 2)
            ldraw.text(
                (lx, ly),
                line,
                fill=(*text_color, 255),
                font=best_font,
                stroke_width=stroke_width,
                stroke_fill=(*stroke_color, 255),
            )
            ly += lh + line_spacing
        # PIL.Image.rotate tourne dans le sens anti-horaire, CSS rotate() dans le sens horaire
        rotated = layer.rotate(-angle, resample=Image.BICUBIC, expand=True)
        cx = bbox_x + bbox_w // 2
        cy = bbox_y + bbox_h // 2
        paste_x = cx - rotated.width // 2
        paste_y = cy - rotated.height // 2
        target_image.paste(rotated, (paste_x, paste_y), rotated)
        return

    cur_y = bbox_y + max(0, (bbox_h - total_h) // 2)

    for line, (lw, lh) in zip(best_lines, line_metrics):
        cur_x = bbox_x + max(0, (bbox_w - lw) // 2)
        draw.text(
            (cur_x, cur_y),
            line,
            fill=text_color,
            font=best_font,
            stroke_width=stroke_width,
            stroke_fill=stroke_color,
        )
        cur_y += lh + line_spacing