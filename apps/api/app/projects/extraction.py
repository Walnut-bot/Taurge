"""Extraction des pages : convertit un PDF ou une archive ZIP/CBZ en une
image par page, ou récupère/découpe une image déjà uploadée.

PyMuPDF (fitz) rend chaque page en PNG sans dépendance système externe
(pas besoin de Poppler installé sur la machine).

Sécurité des archives (ZIP / CBZ) :
- Protection contre le Path Traversal (Zip Slip)
- Limite sur le nombre de fichiers extraits (MAX_ARCHIVE_FILES)
- Limite sur la taille décompressée cumulée (MAX_ARCHIVE_UNCOMPRESSED_BYTES)
  et par entrée (MAX_SINGLE_ENTRY_BYTES) pour contrer les Zip Bombs
- Validation des magic bytes de chaque image extraite
"""

import io
import posixpath
import re
import zipfile
from collections.abc import Iterator

import fitz  # PyMuPDF
from PIL import Image
from app.projects.file_validation import detect_image_type
from app.projects.slicing import iter_webtoon_slices, slice_webtoon_image, is_webtoon_strip

# ~150 DPI : suffisant pour l'OCR et la lecture à l'écran, sans exploser
# la taille de stockage.
RENDER_DPI = 150

# Garde-fous anti-Zip Bomb & DoS (Section 32 du cahier des charges)
MAX_ARCHIVE_FILES = 500
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 500 * 1024 * 1024  # 500 Mo max décompressés
MAX_SINGLE_ENTRY_BYTES = 50 * 1024 * 1024           # 50 Mo max par fichier interne
ARCHIVE_READ_CHUNK_SIZE = 64 * 1024                 # 64 Ko par bloc de lecture


def _natural_sort_key(filename: str) -> list[int | str]:
    """Tri naturel pour que 'page_2.png' précède 'page_10.png'."""
    return [
        int(part) if part.isdigit() else part.lower()
        for part in re.split(r"(\d+)", filename)
    ]


def _is_safe_archive_member(name: str) -> bool:
    """Vérifie qu'un chemin interne d'archive ne tente pas de Path Traversal
    et n'est pas un fichier caché macOS (__MACOSX / ._)."""
    if not name or name.endswith("/"):
        return False
    normalized = name.replace("\\", "/")
    if normalized.startswith("/") or ":" in normalized:
        return False
    parts = [p for p in normalized.split("/") if p]
    if not parts or any(p in ("..", ".") for p in parts):
        return False
    if parts[0] == "__MACOSX" or parts[-1].startswith("._") or parts[-1].startswith("."):
        return False
    norm = posixpath.normpath(normalized)
    if norm.startswith("..") or norm.startswith("/"):
        return False
    return True


def _read_zip_entry_safely(
    zf: zipfile.ZipFile,
    info: zipfile.ZipInfo,
    total_uncompressed_so_far: int,
) -> tuple[bytes, int]:
    """Lit une entrée ZIP par blocs en vérifiant en continu les plafonds
    de décompression (ne fait pas uniquement confiance à info.file_size
    qui peut être falsifié dans l'en-tête ZIP)."""
    if info.file_size > MAX_SINGLE_ENTRY_BYTES:
        raise ValueError(
            f"Fichier interne '{info.filename}' trop volumineux dans l'archive "
            f"(max {MAX_SINGLE_ENTRY_BYTES // (1024 * 1024)} Mo)."
        )
    if total_uncompressed_so_far + info.file_size > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
        raise ValueError(
            "Archive rejetée : taille décompressée maximale dépassée (protection anti zip-bomb)."
        )

    chunks: list[bytes] = []
    entry_read = 0
    with zf.open(info, "r") as stream:
        while True:
            chunk = stream.read(ARCHIVE_READ_CHUNK_SIZE)
            if not chunk:
                break
            entry_read += len(chunk)
            if entry_read > MAX_SINGLE_ENTRY_BYTES:
                raise ValueError(
                    f"Fichier interne '{info.filename}' dépasse la limite autorisée (protection anti zip-bomb)."
                )
            if total_uncompressed_so_far + entry_read > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                raise ValueError(
                    "Archive rejetée : taille décompressée maximale dépassée (protection anti zip-bomb)."
                )
            chunks.append(chunk)

    return b"".join(chunks), total_uncompressed_so_far + entry_read


def iter_pages_from_archive(content: bytes) -> Iterator[tuple[bytes, int, int]]:
    """Extrait les images d'une archive ZIP ou CBZ dans l'ordre naturel,
    avec protection contre le Path Traversal et les Zip Bombs."""
    try:
        zf_ctx = zipfile.ZipFile(io.BytesIO(content), "r")
    except zipfile.BadZipFile as exc:
        raise ValueError("Archive ZIP/CBZ corrompue ou invalide.") from exc

    with zf_ctx as zf:
        all_infos = [info for info in zf.infolist() if not info.is_dir()]
        # Vérification stricte de sécurité sur toutes les entrées avant traitement
        for info in all_infos:
            normalized = info.filename.replace("\\", "/")
            parts = [p for p in normalized.split("/") if p]
            if ".." in parts or normalized.startswith("/") or ":" in normalized:
                raise ValueError(
                    f"Archive rejetée : chemin interdit détecté ('{info.filename}')."
                )

        candidate_infos = [
            info for info in all_infos if _is_safe_archive_member(info.filename)
        ]
        if len(candidate_infos) > MAX_ARCHIVE_FILES:
            raise ValueError(
                f"Archive rejetée : trop de fichiers ({len(candidate_infos)} > {MAX_ARCHIVE_FILES})."
            )

        candidate_infos.sort(key=lambda item: _natural_sort_key(item.filename))

        total_uncompressed = 0
        extracted_count = 0

        for info in candidate_infos:
            entry_bytes, total_uncompressed = _read_zip_entry_safely(
                zf, info, total_uncompressed
            )
            img_type = detect_image_type(entry_bytes)
            if not img_type:
                # Ignore les fichiers non-images (ex. ComicInfo.xml, metadata.json, .txt)
                continue

            img_width, img_height = get_image_dimensions(entry_bytes)
            if is_webtoon_strip(img_width, img_height):
                for slice_bytes, w, h in iter_pages_from_image(entry_bytes):
                    extracted_count += 1
                    if extracted_count > MAX_ARCHIVE_FILES:
                        raise ValueError(
                            f"Nombre maximal de pages extraites dépassé ({MAX_ARCHIVE_FILES})."
                        )
                    yield slice_bytes, w, h
            else:
                # Normalise en PNG pour le pipeline aval
                if img_type == "png":
                    png_bytes = entry_bytes
                else:
                    with Image.open(io.BytesIO(entry_bytes)) as img:
                        out = io.BytesIO()
                        img.convert("RGB").save(out, format="PNG")
                        png_bytes = out.getvalue()
                extracted_count += 1
                if extracted_count > MAX_ARCHIVE_FILES:
                    raise ValueError(
                        f"Nombre maximal de pages extraites dépassé ({MAX_ARCHIVE_FILES})."
                    )
                yield png_bytes, img_width, img_height

        if extracted_count == 0:
            raise ValueError(
                "Aucune image valide (PNG, JPG, WEBP) n'a été trouvée dans l'archive."
            )


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
