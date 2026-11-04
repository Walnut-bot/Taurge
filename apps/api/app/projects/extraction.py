"""Extraction des pages : convertit un PDF en une image par page, ou
récupère les dimensions d'une image déjà uploadée telle quelle.

PyMuPDF (fitz) rend chaque page en PNG sans dépendance système externe
(pas besoin de Poppler installé sur la machine), ce qui simplifie
beaucoup le déploiement pour un solo dev.

Mémoire : les pages sont produites UNE PAR UNE (générateurs). Garder
toutes les pages d'un chapitre en RAM — l'ancien comportement —
faisait dépasser le plafond de 512 Mo des hébergements gratuits dès
un fichier un peu gros (crash OOM du processus en pleine extraction).
"""

import io
from collections.abc import Iterator

import fitz  # PyMuPDF
from PIL import Image
from app.projects.slicing import iter_webtoon_slices, slice_webtoon_image, is_webtoon_strip

# ~150 DPI : suffisant pour l'OCR et la lecture à l'écran, sans exploser
# la taille de stockage. Configurable plus tard si besoin de qualité
# supérieure pour l'export final.
RENDER_DPI = 150


def iter_pages_from_pdf(content: bytes) -> Iterator[tuple[bytes, int, int]]:
    """Produit (image_png_bytes, width, height) page par page, dans l'ordre.

    Le pixmap de chaque page est libéré dès son encodage : seule la
    page en cours vit en mémoire, jamais le chapitre entier.
    """
    zoom = RENDER_DPI / 72
    matrix = fitz.Matrix(zoom, zoom)

    doc = fitz.open(stream=content, filetype="pdf")
    try:
        for page in doc:
            pix = page.get_pixmap(matrix=matrix)
            png_bytes = pix.tobytes("png")
            width, height = pix.width, pix.height
            del pix
            yield png_bytes, width, height
    finally:
        doc.close()


def extract_pages_from_pdf(content: bytes) -> list[tuple[bytes, int, int]]:
    """Retourne une liste de (image_png_bytes, width, height), une par
    page du PDF, dans l'ordre.

    Conservé pour compatibilité ; préférer `iter_pages_from_pdf` dès
    que les pages peuvent être écrites au fil de l'eau (mémoire).
    """
    return list(iter_pages_from_pdf(content))


def get_image_dimensions(content: bytes) -> tuple[int, int]:
    """Lit la largeur/hauteur d'une image déjà uploadée (PNG/JPG/WEBP)."""
    with Image.open(io.BytesIO(content)) as img:
        return img.size


def iter_pages_from_image(content: bytes) -> Iterator[tuple[bytes, int, int]]:
    """Comme `extract_pages_from_image`, mais tranche par tranche."""
    return iter_webtoon_slices(content)


def extract_pages_from_image(content: bytes) -> list[tuple[bytes, int, int]]:
    """Découpe intelligemment les images webtoon géantes en plusieurs pages
    au niveau des gouttières inter-cases, ou retourne l'image unique."""
    return slice_webtoon_image(content)
