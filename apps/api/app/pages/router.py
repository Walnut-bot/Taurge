import io
import logging
import uuid
from PIL import Image, ImageDraw

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.core.db import get_session
from app.models.cleaned_page import CleanedPage
from app.models.page import Page
from app.models.project import Project
from app.models.user import User
from app.projects.access import user_has_project_access
from app.storage.dependencies import get_storage_provider
from app.storage.provider import StorageProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pages", tags=["pages"])

MEDIA_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}


def _guess_media_type(storage_key: str) -> str:
    ext = storage_key.rsplit(".", 1)[-1].lower()
    return MEDIA_TYPES.get(ext, "application/octet-stream")


def _generate_fallback_page_image(page_number: int, width: int | None = 800, height: int | None = 1200) -> bytes:
    """Génère une image de repli lisible si le fichier physique est manquant sur le disque."""
    w = max(width or 800, 400)
    h = max(height or 1200, 600)

    img = Image.new("RGB", (w, h), color=(248, 246, 242))
    draw = ImageDraw.Draw(img)

    # Cadre élégant
    draw.rectangle([(20, 20), (w - 20, h - 20)], outline=(215, 208, 198), width=2)

    lines = [
        f"PAGE {page_number}",
        "",
        "Fichier image introuvable sur le disque.",
        "Le fichier physique a été déplacé ou purgé.",
        "",
        "Vous pouvez réimporter le fichier source",
        "ou supprimer cette page du projet.",
    ]
    text = "\n".join(lines)

    try:
        draw.multiline_text((w // 2, h // 2), text, fill=(130, 115, 100), anchor="mm", align="center")
    except Exception:
        draw.text((w // 4, h // 3), f"PAGE {page_number} - Image introuvable", fill=(130, 115, 100))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@router.get("/{page_id}/image")
def get_page_image(
    page_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: StorageProvider = Depends(get_storage_provider),
):
    page = session.get(Page, page_id)
    if not page:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Page introuvable."
        )
    project = session.get(Project, page.project_id)
    if not user_has_project_access(session, project, current_user.id):
        # Toujours 404, jamais 403 : on ne révèle pas qu'une page
        # appartenant à une autre équipe existe.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Page introuvable."
        )

    try:
        content = storage.read(page.storage_key)
        return Response(content=content, media_type=_guess_media_type(page.storage_key))
    except FileNotFoundError:
        logger.warning(
            "Fichier image manquant sur le disque pour la page %s (%s). Renvoi de l'image de repli.",
            page_id,
            page.storage_key,
        )
        fallback = _generate_fallback_page_image(page.page_number, page.width, page.height)
        return Response(content=fallback, media_type="image/png")


@router.get("/{page_id}/cleaned-image")
def get_cleaned_page_image(
    page_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: StorageProvider = Depends(get_storage_provider),
):
    page = session.get(Page, page_id)
    if not page:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Page introuvable."
        )
    project = session.get(Project, page.project_id)
    if not user_has_project_access(session, project, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Page introuvable."
        )

    cleaned = session.exec(
        select(CleanedPage).where(CleanedPage.page_id == page.id)
    ).first()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cette page n'a pas encore été nettoyée.",
        )

    try:
        content = storage.read(cleaned.storage_key)
        return Response(content=content, media_type="image/png")
    except FileNotFoundError:
        logger.warning(
            "Image nettoyée manquante sur le disque pour la page %s (%s). Repli sur l'originale.",
            page_id,
            cleaned.storage_key,
        )
        try:
            content = storage.read(page.storage_key)
            return Response(content=content, media_type=_guess_media_type(page.storage_key))
        except FileNotFoundError:
            fallback = _generate_fallback_page_image(page.page_number, page.width, page.height)
            return Response(content=fallback, media_type="image/png")
