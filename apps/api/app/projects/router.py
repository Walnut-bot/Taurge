import io
import json
import logging
import uuid
import zipfile
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status, Query
from pydantic import BaseModel
from sqlmodel import Session, select, delete

import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont
from app.auth.dependencies import get_current_user
from app.billing.router import CREDIT_COSTS, deduct_credits, ensure_credits
from app.core.config import settings
from app.core.db import get_session
from app.models.cleaned_page import CleanedPage
from app.models.export import Export
from app.models.ocr_block import OCRBlock
from app.models.page import Page, page_display_order
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.user import User
from app.models.glossary import GlossaryEntry
from app.ocr.dependencies import get_ocr_provider
from app.ocr.provider import OCRProvider
from app.projects.cleaning import clean_image
from app.projects.extraction import extract_pages_from_pdf, get_image_dimensions, extract_pages_from_image
from app.projects.file_validation import detect_file_type
from app.projects.typesetting import render_text_in_bubble
from app.projects.schemas import (
    BatchProcessResponse,
    ExportResponse,
    OCRBlockResponse,
    PageResponse,
    ProjectCreate,
    ProjectDetailResponse,
    ProjectUpdate,
    ProjectResponse,
    SourceFileResponse,
    TranslationResponse,
)
from app.storage.dependencies import get_storage_provider
from app.storage.provider import StorageProvider
from app.translation.dependencies import get_translation_provider
from app.translation.provider import TranslationProvider
from app.models.translation import Translation

router = APIRouter(prefix="/projects", tags=["projects"])


from app.models.subscription import ProjectMember


def _get_owned_project(
    project_id: uuid.UUID, current_user: User, session: Session
) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")

    if project.owner_id == current_user.id:
        return project

    # Vérification si l'utilisateur est un membre invité dans l'équipe
    member = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
    ).first()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable."
        )
    return project


def _read_storage_or_404(storage: StorageProvider, key: str, label: str = "Le fichier") -> bytes:
    try:
        return storage.read(key)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{label} est introuvable sur le disque (fichier déplacé ou purgé).",
        )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = Project(owner_id=current_user.id, **payload.model_dump())
    session.add(project)
    session.commit()
    session.refresh(project)
    return ProjectResponse(**project.model_dump(mode="json"))


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
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



@router.patch("/{project_id}", response_model=ProjectResponse)
def rename_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
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


@router.get("/{project_id}", response_model=ProjectDetailResponse)
def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
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


class PagesReorder(BaseModel):
    page_ids: list[uuid.UUID]


@router.patch("/{project_id}/pages/reorder")
def reorder_project_pages(
    project_id: uuid.UUID,
    payload: PagesReorder,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
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


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = _get_owned_project(project_id, current_user, session)
    session.delete(project)
    session.commit()
    return None


@router.post(
    "/{project_id}/upload",
    response_model=SourceFileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_file(
    project_id: uuid.UUID,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: StorageProvider = Depends(get_storage_provider),
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


def _get_owned_file(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    current_user: User,
    session: Session,
) -> SourceFile:
    _get_owned_project(project_id, current_user, session)  # vérifie l'accès
    source_file = session.get(SourceFile, file_id)
    if not source_file or source_file.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fichier introuvable."
        )
    return source_file


@router.post(
    "/{project_id}/files/{file_id}/extract",
    response_model=list[PageResponse],
    status_code=status.HTTP_201_CREATED,
)
def extract_pages(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: StorageProvider = Depends(get_storage_provider),
):
    source_file = _get_owned_file(project_id, file_id, current_user, session)

    already_extracted = session.exec(
        select(Page).where(Page.source_file_id == source_file.id)
    ).first()
    if already_extracted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce fichier a déjà été extrait en pages.",
        )

    content = _read_storage_or_404(storage, source_file.storage_key, "Le fichier source")
    created_pages: list[Page] = []

    if source_file.file_type == "pdf":
        for index, (png_bytes, width, height) in enumerate(
            extract_pages_from_pdf(content), start=1
        ):
            page = Page(
                project_id=project_id,
                source_file_id=source_file.id,
                page_number=index,
                storage_key="",
                width=width,
                height=height,
            )
            storage_key = f"pages/{project_id}/{page.id}.png"
            page.storage_key = storage_key
            storage.save(storage_key, png_bytes)
            session.add(page)
            created_pages.append(page)
    else:
        # Image déjà uploadée : si c'est une bande webtoon longue, on la découpe
        # intelligemment aux gouttières pour créer plusieurs pages séquentielles.
        # Sinon, on conserve la page unique.
        slices = extract_pages_from_image(content)
        if len(slices) > 1:
            for index, (png_bytes, width, height) in enumerate(slices, start=1):
                page = Page(
                    project_id=project_id,
                    source_file_id=source_file.id,
                    page_number=index,
                    storage_key="",
                    width=width,
                    height=height,
                )
                storage_key = f"pages/{project_id}/{page.id}.png"
                page.storage_key = storage_key
                storage.save(storage_key, png_bytes)
                session.add(page)
                created_pages.append(page)
        else:
            width, height = slices[0][1], slices[0][2]
            page = Page(
                project_id=project_id,
                source_file_id=source_file.id,
                page_number=1,
                storage_key=source_file.storage_key,
                width=width,
                height=height,
            )
            session.add(page)
            created_pages.append(page)

    session.commit()
    for page in created_pages:
        session.refresh(page)

    return [PageResponse(**p.model_dump(mode="json")) for p in created_pages]


def _get_owned_page(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    current_user: User,
    session: Session,
) -> Page:
    _get_owned_project(project_id, current_user, session)  # vérifie l'accès
    page = session.get(Page, page_id)
    if not page or page.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Page introuvable."
        )
    return page


@router.post(
    "/{project_id}/pages/{page_id}/ocr",
    response_model=list[OCRBlockResponse],
    status_code=status.HTTP_201_CREATED,
)
async def run_ocr(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: StorageProvider = Depends(get_storage_provider),
    ocr: OCRProvider = Depends(get_ocr_provider),
):
    project = _get_owned_project(project_id, current_user, session)
    page = _get_owned_page(project_id, page_id, current_user, session)

    ensure_credits(current_user.id, CREDIT_COSTS["ocr"], session)

    image_bytes = _read_storage_or_404(storage, page.storage_key, f"L'image de la page {page.page_number}")

    try:
        detected = await ocr.detect_text(image_bytes, project.source_lang)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Échec de l'OCR : {exc}",
        )

    # Si l'OCR a déjà été lancé, on purge les anciens blocs et traductions
    # pour permettre une nouvelle détection propre. (Après une détection
    # réussie : un échec ne fait plus perdre les anciens blocs et n'est
    # pas facturé.)
    for b in session.exec(select(OCRBlock).where(OCRBlock.page_id == page.id)).all():
        session.exec(delete(Translation).where(Translation.ocr_block_id == b.id))
        session.delete(b)

    created_blocks = []
    for block_data in detected:
        block = OCRBlock(
            page_id=page.id,
            text=block_data.text,
            bbox_x=block_data.bbox_x,
            bbox_y=block_data.bbox_y,
            bbox_w=block_data.bbox_w,
            bbox_h=block_data.bbox_h,
            confidence=block_data.confidence,
            provider=block_data.provider,
        )
        session.add(block)
        created_blocks.append(block)

    session.commit()
    deduct_credits(current_user.id, CREDIT_COSTS["ocr"], "ocr", session, project_id=project.id)
    for block in created_blocks:
        session.refresh(block)

    return [OCRBlockResponse(**b.model_dump(mode="json")) for b in created_blocks]


@router.post(
    "/{project_id}/pages/{page_id}/translate",
    response_model=list[TranslationResponse],
    status_code=status.HTTP_201_CREATED,
)
async def translate_page(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    translator: TranslationProvider = Depends(get_translation_provider),
):
    project = _get_owned_project(project_id, current_user, session)
    page = _get_owned_page(project_id, page_id, current_user, session)

    blocks = session.exec(
        select(OCRBlock).where(OCRBlock.page_id == page.id)
    ).all()
    if not blocks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun texte détecté sur cette page — lance d'abord l'OCR.",
        )

    # Ne traduit que les blocs qui n'ont pas encore de traduction :
    # relancer cet endpoint après un ajout de blocs ne retraduit pas
    # tout depuis zéro.
    already_translated_ids = {
        t.ocr_block_id
        for t in session.exec(
            select(Translation).where(
                Translation.ocr_block_id.in_([b.id for b in blocks])
            )
        ).all()
    }
    blocks_to_translate = [b for b in blocks if b.id not in already_translated_ids]

    if not blocks_to_translate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tous les blocs de cette page sont déjà traduits.",
        )
    ensure_credits(current_user.id, CREDIT_COSTS["translate"], session)

    # Récupération du glossaire du projet pour l'injecter dans l'IA contextuelle
    glossary_entries = session.exec(
        select(GlossaryEntry).where(GlossaryEntry.project_id == project.id)
    ).all()
    glossary_map = {g.source_term: g.target_term for g in glossary_entries if g.is_locked}

    texts_to_translate = [b.text for b in blocks_to_translate]
    try:
        translated_texts = await translator.translate_batch(
            texts_to_translate, project.source_lang, project.target_lang, glossary=glossary_map
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Échec de la traduction : {exc}",
        )

    created_translations = []
    for block, translated_text in zip(blocks_to_translate, translated_texts):
        final_text = translated_text

        # Remplacement / verrouillage des termes définis dans le glossaire
        for g in glossary_entries:
            if g.is_locked and g.source_term.lower() in block.text.lower():
                # Remplacement insensible à la casse si le terme source ou une variante est présente
                import re
                pattern = re.compile(re.escape(g.source_term), re.IGNORECASE)
                if pattern.search(block.text):
                    # Si la traduction automatique a mal rendu le nom, on injecte le terme cible verrouillé
                    final_text = re.sub(re.escape(g.source_term), g.target_term, final_text, flags=re.IGNORECASE)

        translation = Translation(
            ocr_block_id=block.id,
            translated_text=final_text,
            provider=getattr(translator, "last_provider", None) or "ollama",
        )
        session.add(translation)
        created_translations.append(translation)

    session.commit()
    deduct_credits(current_user.id, CREDIT_COSTS["translate"], "translate", session, project_id=project.id)
    for t in created_translations:
        session.refresh(t)

    return [TranslationResponse(**t.model_dump(mode="json")) for t in created_translations]


@router.post(
    "/{project_id}/export",
    response_model=ExportResponse,
    status_code=status.HTTP_201_CREATED,
)
def export_project(
    project_id: uuid.UUID,
    format: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: StorageProvider = Depends(get_storage_provider),
):
    project = _get_owned_project(project_id, current_user, session)

    pages = session.exec(
        select(Page)
        .where(Page.project_id == project.id)
        .order_by(*page_display_order())
    ).all()
    if not pages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucune page à exporter — importe et extrais au moins "
            "un fichier avant d'exporter.",
        )

    # Détection du format demandé (ZIP, CBZ ou PDF)
    source_file = session.exec(
        select(SourceFile).where(SourceFile.project_id == project.id).order_by(SourceFile.created_at)
    ).first()
    
    target_format = (format or "").strip().lower()
    if not target_format:
        target_format = "pdf" if (source_file and source_file.file_type.lower() == "pdf") else "zip"

    if target_format not in ("zip", "cbz", "pdf"):
        target_format = "zip"

    def _render_page_with_text(page_obj: Page) -> bytes:
        cleaned_rec = session.exec(
            select(CleanedPage).where(CleanedPage.page_id == page_obj.id)
        ).first()
        target_key = cleaned_rec.storage_key if cleaned_rec else page_obj.storage_key
        try:
            raw_bytes = storage.read(target_key)
        except FileNotFoundError:
            try:
                raw_bytes = storage.read(page_obj.storage_key)
            except FileNotFoundError:
                from app.pages.router import _generate_fallback_page_image
                return _generate_fallback_page_image(page_obj.page_number, page_obj.width, page_obj.height)
        
        image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        draw = ImageDraw.Draw(image)

        blocks_on_page = session.exec(
            select(OCRBlock).where(OCRBlock.page_id == page_obj.id)
        ).all()

        is_cleaned = cleaned_rec is not None
        for b in blocks_on_page:
            trans = session.exec(
                select(Translation).where(Translation.ocr_block_id == b.id)
            ).first()
            if trans and trans.translated_text:
                if not is_cleaned:
                    draw.rectangle(
                        [
                            max(0, b.bbox_x - 2),
                            max(0, b.bbox_y - 2),
                            min(image.width, b.bbox_x + b.bbox_w + 2),
                            min(image.height, b.bbox_y + b.bbox_h + 2),
                        ],
                        fill=(255, 255, 255),
                    )

                # Conversion des couleurs hex en RGB
                def hex_to_rgb(hex_str: str, default: tuple[int, int, int]) -> tuple[int, int, int]:
                    try:
                        hex_clean = hex_str.lstrip('#')
                        return tuple(int(hex_clean[i:i+2], 16) for i in (0, 2, 4))  # type: ignore
                    except Exception:
                        return default

                txt_color = hex_to_rgb(b.text_color, (15, 15, 15))
                strk_color = hex_to_rgb(b.stroke_color, (255, 255, 255))

                render_text_in_bubble(
                    draw=draw,
                    text=trans.translated_text,
                    bbox_x=b.bbox_x,
                    bbox_y=b.bbox_y,
                    bbox_w=b.bbox_w,
                    bbox_h=b.bbox_h,
                    style_type=getattr(b, "manhwa_style", "dialogue"),
                    text_color=txt_color,
                    stroke_color=strk_color,
                    stroke_width=getattr(b, "stroke_width", 2),
                )

        out_io = io.BytesIO()
        image.save(out_io, format="PNG")
        return out_io.getvalue()

    if target_format == "pdf":
        # Assemblage direct d'un PDF complet avec texte traduit et bulles nettoyées
        pdf_doc = fitz.open()
        for page in pages:
            page_png = _render_page_with_text(page)
            img_doc = fitz.open(stream=page_png, filetype="png")
            rect = img_doc[0].rect
            pdf_page = pdf_doc.new_page(width=rect.width, height=rect.height)
            pdf_page.insert_image(rect, stream=page_png)
            img_doc.close()

        pdf_bytes = pdf_doc.tobytes()
        pdf_doc.close()

        export = Export(project_id=project.id, format="pdf", storage_key="")
        storage_key = f"exports/{project.id}/{export.id}.pdf"
        export.storage_key = storage_key
        storage.save(storage_key, pdf_bytes)
    elif target_format == "cbz":
        # Export Manga CBZ (Comic Book Zip)
        cbz_buffer = io.BytesIO()
        with zipfile.ZipFile(cbz_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for display_number, page in enumerate(pages, start=1):
                page_png = _render_page_with_text(page)
                zf.writestr(f"page_{display_number:03d}.png", page_png)

        export = Export(project_id=project.id, format="cbz", storage_key="")
        storage_key = f"exports/{project.id}/{export.id}.cbz"
        export.storage_key = storage_key
        storage.save(storage_key, cbz_buffer.getvalue())
    else:
        # Export ZIP avec les pages rendues et nettoyées
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for display_number, page in enumerate(pages, start=1):
                page_png = _render_page_with_text(page)
                zf.writestr(f"page_{display_number:03d}.png", page_png)

        export = Export(project_id=project.id, format="zip", storage_key="")
        storage_key = f"exports/{project.id}/{export.id}.zip"
        export.storage_key = storage_key
        storage.save(storage_key, zip_buffer.getvalue())

    session.add(export)
    session.commit()
    session.refresh(export)

    return ExportResponse(**export.model_dump(mode="json"))


@router.post(
    "/{project_id}/pages/{page_id}/clean",
    response_model=PageResponse,
    status_code=status.HTTP_201_CREATED,
)
def clean_page(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: StorageProvider = Depends(get_storage_provider),
):
    """Relancer ce endpoint sur une page déjà nettoyée régénère le
    nettoyage depuis l'image ORIGINALE (jamais depuis une version déjà
    nettoyée) et remplace le résultat précédent — utile après avoir
    corrigé des blocs OCR mal positionnés.
    """
    project = _get_owned_project(project_id, current_user, session)
    page = _get_owned_page(project_id, page_id, current_user, session)

    blocks = session.exec(
        select(OCRBlock).where(OCRBlock.page_id == page.id)
    ).all()
    if not blocks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun texte détecté sur cette page — lance d'abord l'OCR.",
        )
    ensure_credits(current_user.id, CREDIT_COSTS["clean"], session)

    original_bytes = _read_storage_or_404(storage, page.storage_key, f"L'image de la page {page.page_number}")
    bboxes = [(b.bbox_x, b.bbox_y, b.bbox_w, b.bbox_h) for b in blocks]

    try:
        cleaned_bytes = clean_image(original_bytes, bboxes)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Échec du nettoyage : {exc}",
        )

    storage_key = f"cleaned/{project_id}/{page.id}.png"
    storage.save(storage_key, cleaned_bytes)

    cleaned_page = session.exec(
        select(CleanedPage).where(CleanedPage.page_id == page.id)
    ).first()
    if cleaned_page:
        cleaned_page.storage_key = storage_key
        cleaned_page.created_at = datetime.now(timezone.utc)
    else:
        cleaned_page = CleanedPage(page_id=page.id, storage_key=storage_key)
    session.add(cleaned_page)
    session.commit()
    deduct_credits(current_user.id, CREDIT_COSTS["clean"], "clean", session, project_id=project.id)
    session.refresh(cleaned_page)
    session.refresh(page)

    blocks_response = []
    for b in blocks:
        translation = session.exec(
            select(Translation).where(Translation.ocr_block_id == b.id)
        ).first()
        blocks_response.append(
            OCRBlockResponse(
                **b.model_dump(mode="json"),
                translation=(
                    TranslationResponse(**translation.model_dump(mode="json"))
                    if translation
                    else None
                ),
            )
        )

    return PageResponse(
        **page.model_dump(mode="json"),
        ocr_blocks=blocks_response,
        cleaned_at=cleaned_page.created_at,
    )


@router.post(
    "/{project_id}/batch-process",
    response_model=BatchProcessResponse,
    status_code=status.HTTP_200_OK,
)
async def batch_process_project(
    project_id: uuid.UUID,
    include_ocr: bool = True,
    include_translate: bool = True,
    include_clean: bool = True,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: StorageProvider = Depends(get_storage_provider),
    ocr: OCRProvider = Depends(get_ocr_provider),
    translator: TranslationProvider = Depends(get_translation_provider),
):
    project = _get_owned_project(project_id, current_user, session)
    pages = session.exec(
        select(Page).where(Page.project_id == project.id).order_by(*page_display_order())
    ).all()

    if not pages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucune page extraite dans ce projet.",
        )

    glossary_entries = session.exec(
        select(GlossaryEntry).where(GlossaryEntry.project_id == project.id)
    ).all()
    glossary_map = {g.source_term: g.target_term for g in glossary_entries if g.is_locked}

    total_ocr_blocks = 0
    total_translations = 0
    total_cleaned = 0

    for page in pages:
        existing_blocks = session.exec(
            select(OCRBlock).where(OCRBlock.page_id == page.id)
        ).all()

        # 1. OCR si demandé et pas encore fait
        if include_ocr and not existing_blocks:
            try:
                ensure_credits(current_user.id, CREDIT_COSTS["ocr"], session)
                image_bytes = _read_storage_or_404(storage, page.storage_key, f"L'image de la page {page.page_number}")
                detected = await ocr.detect_text(image_bytes, project.source_lang)
                for d in detected:
                    block = OCRBlock(
                        page_id=page.id,
                        text=d.text,
                        bbox_x=d.bbox_x,
                        bbox_y=d.bbox_y,
                        bbox_w=d.bbox_w,
                        bbox_h=d.bbox_h,
                        confidence=d.confidence,
                        provider=d.provider,
                    )
                    session.add(block)
                session.commit()
                deduct_credits(current_user.id, CREDIT_COSTS["ocr"], "ocr", session, project_id=project.id)
                existing_blocks = session.exec(
                    select(OCRBlock).where(OCRBlock.page_id == page.id)
                ).all()
                total_ocr_blocks += len(existing_blocks)
            except HTTPException:
                raise
            except Exception as exc:
                session.rollback()
                logger.warning("Erreur OCR sur la page %s: %s", page.page_number, exc)

        # 2. Traduction des blocs non encore traduits
        if include_translate and existing_blocks:
            already_translated_ids = {
                t.ocr_block_id
                for t in session.exec(
                    select(Translation).where(
                        Translation.ocr_block_id.in_([b.id for b in existing_blocks])
                    )
                ).all()
            }
            to_translate = [b for b in existing_blocks if b.id not in already_translated_ids]

            if to_translate:
                try:
                    ensure_credits(current_user.id, CREDIT_COSTS["translate"], session)
                    texts = [b.text for b in to_translate]
                    translated = await translator.translate_batch(
                        texts, project.source_lang, project.target_lang, glossary=glossary_map
                    )
                    for block, trans_text in zip(to_translate, translated):
                        existing_trans = session.exec(
                            select(Translation).where(Translation.ocr_block_id == block.id)
                        ).first()
                        if existing_trans:
                            existing_trans.translated_text = trans_text
                            existing_trans.provider = getattr(translator, "last_provider", None) or "ollama"
                            session.add(existing_trans)
                        else:
                            t_rec = Translation(
                                ocr_block_id=block.id,
                                translated_text=trans_text,
                                provider=getattr(translator, "last_provider", None) or "ollama",
                            )
                            session.add(t_rec)
                    session.commit()
                    deduct_credits(current_user.id, CREDIT_COSTS["translate"], "translate", session, project_id=project.id)
                    total_translations += len(to_translate)
                except HTTPException:
                    raise
                except Exception as exc:
                    session.rollback()
                    logger.warning("Erreur traduction page %s: %s", page.page_number, exc)

        # 3. Nettoyage de la page (Inpainting)
        if include_clean and existing_blocks:
            try:
                ensure_credits(current_user.id, CREDIT_COSTS["clean"], session)
                original_bytes = _read_storage_or_404(storage, page.storage_key, f"L'image de la page {page.page_number}")
                bboxes = [(b.bbox_x, b.bbox_y, b.bbox_w, b.bbox_h) for b in existing_blocks]
                cleaned_bytes = clean_image(original_bytes, bboxes)
                storage_key = f"cleaned/{project.id}/{page.id}.png"
                storage.save(storage_key, cleaned_bytes)

                cleaned_rec = session.exec(
                    select(CleanedPage).where(CleanedPage.page_id == page.id)
                ).first()
                if cleaned_rec:
                    cleaned_rec.storage_key = storage_key
                    cleaned_rec.created_at = datetime.now(timezone.utc)
                else:
                    cleaned_rec = CleanedPage(page_id=page.id, storage_key=storage_key)
                session.add(cleaned_rec)
                session.commit()
                deduct_credits(current_user.id, CREDIT_COSTS["clean"], "clean", session, project_id=project.id)
                total_cleaned += 1
            except HTTPException:
                raise
            except Exception as exc:
                session.rollback()
                logger.warning("Erreur nettoyage page %s: %s", page.page_number, exc)

    return BatchProcessResponse(
        processed_pages=len(pages),
        ocr_blocks_count=total_ocr_blocks,
        translations_count=total_translations,
        cleaned_pages_count=total_cleaned,
    )


@router.post(
    "/{project_id}/pages/{page_id}/process-full",
    response_model=PageResponse,
    status_code=status.HTTP_200_OK,
)
async def process_page_full(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    include_ocr: bool = True,
    include_translate: bool = True,
    include_clean: bool = True,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: StorageProvider = Depends(get_storage_provider),
    ocr: OCRProvider = Depends(get_ocr_provider),
    translator: TranslationProvider = Depends(get_translation_provider),
):
    """Exécute l'OCR, la traduction et le nettoyage sur une seule page de manière unifiée."""
    project = _get_owned_project(project_id, current_user, session)
    page = _get_owned_page(project_id, page_id, current_user, session)

    glossary_entries = session.exec(
        select(GlossaryEntry).where(GlossaryEntry.project_id == project.id)
    ).all()
    glossary_map = {g.source_term: g.target_term for g in glossary_entries if g.is_locked}

    existing_blocks = session.exec(
        select(OCRBlock).where(OCRBlock.page_id == page.id)
    ).all()

    # 1. OCR
    if include_ocr and not existing_blocks:
        try:
            ensure_credits(current_user.id, CREDIT_COSTS["ocr"], session)
            image_bytes = _read_storage_or_404(storage, page.storage_key, f"L'image de la page {page.page_number}")
            detected = await ocr.detect_text(image_bytes, project.source_lang)
            for d in detected:
                block = OCRBlock(
                    page_id=page.id,
                    text=d.text,
                    bbox_x=d.bbox_x,
                    bbox_y=d.bbox_y,
                    bbox_w=d.bbox_w,
                    bbox_h=d.bbox_h,
                    confidence=d.confidence,
                    provider=d.provider,
                )
                session.add(block)
            session.commit()
            deduct_credits(current_user.id, CREDIT_COSTS["ocr"], "ocr", session, project_id=project.id)
            existing_blocks = session.exec(
                select(OCRBlock).where(OCRBlock.page_id == page.id)
            ).all()
        except HTTPException:
            raise
        except Exception as exc:
            session.rollback()
            logger.warning("Erreur OCR page %s: %s", page.page_number, exc)

    # 2. Traduction
    if include_translate and existing_blocks:
        already_translated_ids = {
            t.ocr_block_id
            for t in session.exec(
                select(Translation).where(
                    Translation.ocr_block_id.in_([b.id for b in existing_blocks])
                )
            ).all()
        }
        to_translate = [b for b in existing_blocks if b.id not in already_translated_ids]

        if to_translate:
            try:
                ensure_credits(current_user.id, CREDIT_COSTS["translate"], session)
                texts = [b.text for b in to_translate]
                translated = await translator.translate_batch(
                    texts, project.source_lang, project.target_lang, glossary=glossary_map
                )
                for block, trans_text in zip(to_translate, translated):
                    existing_trans = session.exec(
                        select(Translation).where(Translation.ocr_block_id == block.id)
                    ).first()
                    if existing_trans:
                        existing_trans.translated_text = trans_text
                        existing_trans.provider = getattr(translator, "last_provider", None) or "ollama"
                        session.add(existing_trans)
                    else:
                        t_rec = Translation(
                            ocr_block_id=block.id,
                            translated_text=trans_text,
                            provider=getattr(translator, "last_provider", None) or "ollama",
                        )
                        session.add(t_rec)
                session.commit()
                deduct_credits(current_user.id, CREDIT_COSTS["translate"], "translate", session, project_id=project.id)
            except HTTPException:
                raise
            except Exception as exc:
                session.rollback()
                logger.warning("Erreur traduction page %s: %s", page.page_number, exc)

    # 3. Nettoyage
    cleaned_page = session.exec(
        select(CleanedPage).where(CleanedPage.page_id == page.id)
    ).first()

    if include_clean and existing_blocks and not cleaned_page:
        try:
            ensure_credits(current_user.id, CREDIT_COSTS["clean"], session)
            original_bytes = _read_storage_or_404(storage, page.storage_key, f"L'image de la page {page.page_number}")
            bboxes = [(b.bbox_x, b.bbox_y, b.bbox_w, b.bbox_h) for b in existing_blocks]
            cleaned_bytes = clean_image(original_bytes, bboxes)
            storage_key = f"cleaned/{project.id}/{page.id}.png"
            storage.save(storage_key, cleaned_bytes)

            cleaned_page = CleanedPage(page_id=page.id, storage_key=storage_key)
            session.add(cleaned_page)
            session.commit()
            deduct_credits(current_user.id, CREDIT_COSTS["clean"], "clean", session, project_id=project.id)
            session.refresh(cleaned_page)
        except HTTPException:
            raise
        except Exception as exc:
            session.rollback()
            logger.warning("Erreur nettoyage page %s: %s", page.page_number, exc)

    session.refresh(page)
    blocks_response = []
    for b in existing_blocks:
        translation = session.exec(
            select(Translation).where(Translation.ocr_block_id == b.id)
        ).first()
        blocks_response.append(
            OCRBlockResponse(
                **b.model_dump(mode="json"),
                translation=(
                    TranslationResponse(**translation.model_dump(mode="json"))
                    if translation
                    else None
                ),
            )
        )

    return PageResponse(
        **page.model_dump(mode="json"),
        ocr_blocks=blocks_response,
        cleaned_at=cleaned_page.created_at if cleaned_page else None,
    )
