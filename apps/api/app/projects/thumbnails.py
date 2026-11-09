"""Miniatures (thumbnails) des pages : génération Pillow, clé dédiée.

La miniature est un PNG redimensionné (plus grand côté <= THUMBNAIL_MAX_SIDE).
Elle est générée à l'extraction quand c'est possible, et à la demande par
l'endpoint ``GET /pages/{id}/thumbnail`` pour les anciennes pages.
"""
import io
import logging
import uuid

from PIL import Image

from app.storage.provider import StorageProvider

logger = logging.getLogger(__name__)
THUMBNAIL_MAX_SIDE = 320


def thumbnail_key(project_id: uuid.UUID, page_id: uuid.UUID) -> str:
    return f"thumbnails/{project_id}/{page_id}.png"


def thumbnail_url_for(page_id: uuid.UUID) -> str:
    return f"/pages/{page_id}/thumbnail"


def make_thumbnail_bytes(content: bytes, max_side: int = THUMBNAIL_MAX_SIDE) -> bytes:
    with Image.open(io.BytesIO(content)) as img:
        thumb = img.convert("RGB")
        thumb.thumbnail((max_side, max_side))
        out = io.BytesIO()
        thumb.save(out, format="PNG")
        return out.getvalue()


def ensure_page_thumbnail(storage: StorageProvider, page) -> str:
    """Génère et stocke la miniature d'une page si absente. Retourne la clé."""
    key = thumbnail_key(page.project_id, page.id)
    if storage.exists(key):
        return key
    content = storage.read(page.storage_key)
    storage.save(key, make_thumbnail_bytes(content))
    return key
