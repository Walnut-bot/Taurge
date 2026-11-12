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
from app.projects.thumbnails import ensure_page_thumbnail, thumbnail_url_for
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


def export_project(
    project_id: uuid.UUID,
    format: str | None,
    current_user: User,
    session: Session,
    storage: StorageProvider,
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
                    rotation_angle=getattr(b, "rotation_angle", 0) or 0,
                    font_size_scale=getattr(b, "font_size_scale", 1.0) or 1.0,
                    target_image=image,
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
        # Export ZIP avec les pages rendues et nettoyées + metadata.json portable
        glossary_entries = session.exec(
            select(GlossaryEntry).where(GlossaryEntry.project_id == project.id)
        ).all()
        manifest_pages = []
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for display_number, page in enumerate(pages, start=1):
                filename = f"page_{display_number:03d}.png"
                page_png = _render_page_with_text(page)
                zf.writestr(filename, page_png)

                blocks_on_page = session.exec(
                    select(OCRBlock).where(OCRBlock.page_id == page.id)
                ).all()
                manifest_blocks = []
                for b in blocks_on_page:
                    trans = session.exec(
                        select(Translation).where(Translation.ocr_block_id == b.id)
                    ).first()
                    manifest_blocks.append({
                        "id": str(b.id),
                        "text": b.text,
                        "translated_text": trans.translated_text if trans else None,
                        "provider": trans.provider if trans else None,
                        "edited_by_user": trans.edited_by_user if trans else False,
                        "bbox": [b.bbox_x, b.bbox_y, b.bbox_w, b.bbox_h],
                        "confidence": b.confidence,
                        "bubble_type": b.bubble_type,
                        "manhwa_style": b.manhwa_style,
                        "rotation_angle": b.rotation_angle,
                        "font_size_scale": b.font_size_scale,
                        "text_color": b.text_color,
                        "stroke_color": b.stroke_color,
                        "stroke_width": b.stroke_width,
                    })
                manifest_pages.append({
                    "page_number": display_number,
                    "filename": filename,
                    "width": page.width,
                    "height": page.height,
                    "workflow_status": page.workflow_status,
                    "blocks": manifest_blocks,
                })

            metadata_payload = {
                "project": {
                    "id": str(project.id),
                    "name": project.name,
                    "content_type": project.content_type,
                    "source_lang": project.source_lang,
                    "target_lang": project.target_lang,
                    "exported_at": datetime.now(timezone.utc).isoformat(),
                },
                "glossary": [
                    {
                        "category": g.category,
                        "source_term": g.source_term,
                        "target_term": g.target_term,
                        "is_locked": g.is_locked,
                        "notes": g.notes,
                    }
                    for g in glossary_entries
                ],
                "pages": manifest_pages,
            }
            zf.writestr(
                "metadata.json",
                json.dumps(metadata_payload, ensure_ascii=False, indent=2),
            )

        export = Export(project_id=project.id, format="zip", storage_key="")
        storage_key = f"exports/{project.id}/{export.id}.zip"
        export.storage_key = storage_key
        storage.save(storage_key, zip_buffer.getvalue())

    session.add(export)
    session.commit()
    session.refresh(export)

    return ExportResponse(**export.model_dump(mode="json"))


