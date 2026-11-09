from __future__ import annotations
import io
import json
import logging
import re
import uuid
import zipfile
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

import fitz
from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageDraw, ImageFont
from sqlmodel import Session, delete, select

from app.billing.router import CREDIT_COSTS, deduct_credits, ensure_credits
from app.core.config import settings
from app.models.cleaned_page import CleanedPage
from app.models.export import Export
from app.models.glossary import GlossaryEntry
from app.models.job import Job
from app.models.ocr_block import OCRBlock
from app.models.page import Page, page_display_order
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.subscription import ProjectMember, UsageLedger
from app.models.translation import Translation
from app.models.user import User
from app.ocr.provider import OCRProvider
from app.projects.access import get_owned_file, get_owned_page, get_owned_project
from app.projects.cleaning import clean_image
from app.projects.extraction import get_image_dimensions, iter_pages_from_image, iter_pages_from_pdf
from app.projects.file_validation import detect_file_type
from app.projects.slicing import is_webtoon_strip
from app.projects.thumbnails import ensure_page_thumbnail, thumbnail_key, thumbnail_url_for
from app.projects.typesetting import render_text_in_bubble
from app.projects.schemas import (
    BatchProcessResponse, ExportResponse, OCRBlockResponse, PageResponse,
    ProjectCreate, ProjectDetailResponse, ProjectResponse, ProjectUpdate,
    SourceFileResponse, TranslationResponse,
)
from app.storage.provider import StorageProvider
from app.translation.provider import TranslationProvider


def _get_owned_project(project_id, current_user, session):
    return get_owned_project(session, project_id, current_user.id)


def _get_owned_file(project_id, file_id, current_user, session):
    return get_owned_file(session, project_id, file_id, current_user.id)


def _get_owned_page(project_id, page_id, current_user, session):
    return get_owned_page(session, project_id, page_id, current_user.id)


def _read_storage_or_404(storage, key, label="Le fichier"):
    try:
        return storage.read(key)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} est introuvable sur le disque (fichier déplacé ou purgé).")


def create_project(
    payload: ProjectCreate,
    current_user: User,
    session: Session,
):
    project = Project(owner_id=current_user.id, **payload.model_dump())
    session.add(project)
    session.commit()
    session.refresh(project)
    return ProjectResponse(**project.model_dump(mode="json"))


def list_projects(
    current_user: User,
    session: Session,
):
    # Projets possédés
    owned_projects = session.exec(
        select(Project).where(Project.owner_id == current_user.id)
    ).all()

    # Projets partagés en équipe
    member_records = session.exec(
        select(ProjectMember).where(ProjectMember.user_id == current_user.id)
    ).all()
    shared_ids = [m.project_id for m in member_records]

    shared_projects = []
    if shared_ids:
        shared_projects = session.exec(
            select(Project).where(Project.id.in_(shared_ids))
        ).all()

    all_projects = {p.id: p for p in (owned_projects + shared_projects)}.values()
    return [ProjectResponse(**p.model_dump(mode="json")) for p in all_projects]


def rename_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    current_user: User,
    session: Session,
):
    project = _get_owned_project(project_id, current_user, session)
    if project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action r\u00e9serv\u00e9e au propri\u00e9taire.",
        )
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le nom du projet ne peut pas \u00eatre vide.",
        )
    project.name = name[:200]
    session.add(project)
    session.commit()
    session.refresh(project)
    return ProjectResponse(**project.model_dump(mode="json"))


def get_project_detail(
    project_id: uuid.UUID,
    current_user: User,
    session: Session,
):
    project = _get_owned_project(project_id, current_user, session)
    files = session.exec(
        select(SourceFile).where(SourceFile.project_id == project.id)
    ).all()
    pages = session.exec(
        select(Page)
        .where(Page.project_id == project.id)
        .order_by(*page_display_order())
    ).all()

    page_ids = [page.id for page in pages]
    blocks_by_page: dict[uuid.UUID, list[OCRBlock]] = {}
    translations_by_block: dict[uuid.UUID, Translation] = {}
    cleaned_by_page: dict[uuid.UUID, CleanedPage] = {}
    if page_ids:
        blocks = session.exec(
            select(OCRBlock).where(OCRBlock.page_id.in_(page_ids))
        ).all()
        block_ids = [block.id for block in blocks]
        for block in blocks:
            blocks_by_page.setdefault(block.page_id, []).append(block)
        if block_ids:
            translations = session.exec(
                select(Translation).where(Translation.ocr_block_id.in_(block_ids))
            ).all()
            translations_by_block = {
                translation.ocr_block_id: translation
                for translation in translations
            }
        cleaned_pages = session.exec(
            select(CleanedPage).where(CleanedPage.page_id.in_(page_ids))
        ).all()
        cleaned_by_page = {cleaned.page_id: cleaned for cleaned in cleaned_pages}

    page_responses = []
    for page in pages:
        block_responses = []
        for b in blocks_by_page.get(page.id, []):
            translation = translations_by_block.get(b.id)
            block_responses.append(
                OCRBlockResponse(
                    **b.model_dump(mode="json"),
                    translation=(
                        TranslationResponse(**translation.model_dump(mode="json"))
                        if translation
                        else None
                    ),
                )
            )
        cleaned = cleaned_by_page.get(page.id)

        page_responses.append(
            PageResponse(
                **page.model_dump(mode="json"),
                ocr_blocks=block_responses,
                cleaned_at=cleaned.created_at if cleaned else None,
                thumbnail_url=thumbnail_url_for(page.id),
            )
        )

    exports = session.exec(
        select(Export)
        .where(Export.project_id == project.id)
        .order_by(Export.created_at.desc())
    ).all()

    return ProjectDetailResponse(
        **project.model_dump(mode="json"),
        files=[SourceFileResponse(**f.model_dump(mode="json")) for f in files],
        pages=page_responses,
        exports=[ExportResponse(**e.model_dump(mode="json")) for e in exports],
    )


def reorder_project_pages(
    project_id: uuid.UUID,
    payload: PagesReorder,
    current_user: User,
    session: Session,
):
    """Réordonne les pages du projet (glisser-déposer dans l'atelier).

    La liste doit contenir exactement toutes les pages du projet, sans
    doublon. Les numéros de page sont renumérotés 1..N dans le nouvel ordre.
    """
    project = _get_owned_project(project_id, current_user, session)
    pages = session.exec(
        select(Page).where(Page.project_id == project.id)
    ).all()
    current_ids = {page.id for page in pages}
    if set(payload.page_ids) != current_ids or len(payload.page_ids) != len(current_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La liste doit contenir exactement toutes les pages du projet, sans doublon.",
        )
    by_id = {page.id: page for page in pages}
    for position, page_id in enumerate(payload.page_ids, start=1):
        page = by_id[page_id]
        page.page_number = position
        page.sort_order = position
        session.add(page)
    session.commit()
    return {"page_ids": [str(page_id) for page_id in payload.page_ids]}


def delete_project_cascade(
    project: Project, session: Session, storage: StorageProvider
) -> None:
    """Supprime tout ce qui rattache le projet à la base et au disque.

    Sans ça, `session.delete(project)` seul échoue sur PostgreSQL
    (violation de clé étrangère dès qu'il existe des pages) et laisse
    des fichiers orphelins. Les fichiers sont supprimés au mieux :
    le provider local ignore déjà les clés absentes.
    """
    pages = session.exec(select(Page).where(Page.project_id == project.id)).all()
    page_ids = [page.id for page in pages]
    blocks = (
        session.exec(select(OCRBlock).where(OCRBlock.page_id.in_(page_ids))).all()
        if page_ids
        else []
    )
    block_ids = [block.id for block in blocks]
    if block_ids:
        for translation in session.exec(
            select(Translation).where(Translation.ocr_block_id.in_(block_ids))
        ).all():
            session.delete(translation)
    for block in blocks:
        session.delete(block)
    if page_ids:
        for cleaned in session.exec(
            select(CleanedPage).where(CleanedPage.page_id.in_(page_ids))
        ).all():
            storage.delete(cleaned.storage_key)
            session.delete(cleaned)
    for page in pages:
        # Une page image unique peut partager la clé du fichier source :
        # la suppression est idempotente, aucun risque à passer deux fois.
        storage.delete(page.storage_key)
        storage.delete(thumbnail_key(page.project_id, page.id))
        session.delete(page)
    for source in session.exec(
        select(SourceFile).where(SourceFile.project_id == project.id)
    ).all():
        storage.delete(source.storage_key)
        session.delete(source)
    for entry in session.exec(
        select(GlossaryEntry).where(GlossaryEntry.project_id == project.id)
    ).all():
        session.delete(entry)
    for export in session.exec(
        select(Export).where(Export.project_id == project.id)
    ).all():
        storage.delete(export.storage_key)
        session.delete(export)
    for job in session.exec(select(Job).where(Job.project_id == project.id)).all():
        session.delete(job)
    for member in session.exec(
        select(ProjectMember).where(ProjectMember.project_id == project.id)
    ).all():
        session.delete(member)
    # Historique de facturation : on conserve les lignes (audit des
    # crédits) mais on les détache du projet. Sans ça, PostgreSQL
    # rejette la suppression (FK usage_ledgers.project_id) dès qu'un
    # membre — pas forcément le propriétaire — a consommé des crédits
    # sur le projet ; SQLite ne contrôle pas les FK, d'où le bug
    # invisible en local et le 500 en production.
    for ledger in session.exec(
        select(UsageLedger).where(UsageLedger.project_id == project.id)
    ).all():
        ledger.project_id = None
        session.add(ledger)


def delete_project_record(
    project_id: uuid.UUID,
    current_user: User,
    session: Session,
    storage: StorageProvider,
):
    project = _get_owned_project(project_id, current_user, session)
    if project.owner_id != current_user.id:
        # Même garde que le renommage : un membre invité peut travailler
        # sur le projet, pas le supprimer.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée au propriétaire.",
        )
    delete_project_cascade(project, session, storage)
    session.delete(project)
    session.commit()
    return None


async def upload_file(
    project_id: uuid.UUID,
    file: UploadFile,
    current_user: User,
    session: Session,
    storage: StorageProvider,
):
    project = _get_owned_project(project_id, current_user, session)

    content = await file.read()

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Fichier trop volumineux (max {settings.max_upload_size_mb} Mo).",
        )

    file_type = detect_file_type(content)
    if not file_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format de fichier non reconnu ou non supporté "
            "(PDF, PNG, JPG, WEBP uniquement au MVP-0).",
        )

    source_file = SourceFile(
        project_id=project.id,
        storage_key="",  # complété juste après avoir l'id
        original_filename=file.filename or "sans_nom",
        file_type=file_type,
        size_bytes=len(content),
    )
    storage_key = f"originals/{project.id}/{source_file.id}.{file_type}"
    source_file.storage_key = storage_key

    storage.save(storage_key, content)

    session.add(source_file)
    session.commit()
    session.refresh(source_file)

    return SourceFileResponse(**source_file.model_dump(mode="json"))


