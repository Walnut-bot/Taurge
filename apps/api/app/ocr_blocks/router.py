import io
import logging
import uuid

logger = logging.getLogger(__name__)
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from PIL import Image
from pydantic import BaseModel
from sqlmodel import Session, select, delete as sql_delete

from app.auth.dependencies import get_current_user
from app.billing.router import CREDIT_COSTS, deduct_credits, ensure_credits
from app.core.db import get_session
from app.models.ocr_block import OCRBlock
from app.models.page import Page
from app.models.project import Project
from app.models.translation import Translation
from app.models.user import User
from app.projects.access import user_has_project_access
from app.projects.schemas import OCRBlockResponse, TranslationResponse
from app.ocr.dependencies import get_ocr_provider
from app.ocr.provider import OCRProvider
from app.storage.dependencies import get_storage_provider
from app.storage.provider import StorageProvider
from app.translation.dependencies import get_translation_provider
from app.translation.provider import TranslationProvider

router = APIRouter(prefix="/ocr-blocks", tags=["ocr-blocks"])


class OCRBlockCreate(BaseModel):
    page_id: uuid.UUID
    bbox_x: int
    bbox_y: int
    bbox_w: int
    bbox_h: int
    text: Optional[str] = None
    bubble_type: Optional[str] = "B"
    manhwa_style: Optional[str] = "dialogue"
    rotation_angle: Optional[int] = 0
    font_size_scale: Optional[float] = 1.0
    text_color: Optional[str] = "#0d0d0d"
    stroke_color: Optional[str] = "#ffffff"
    stroke_width: Optional[int] = 2


class OCRBlockUpdate(BaseModel):
    text: Optional[str] = None
    bbox_x: Optional[int] = None
    bbox_y: Optional[int] = None
    bbox_w: Optional[int] = None
    bbox_h: Optional[int] = None
    bubble_type: Optional[str] = None
    manhwa_style: Optional[str] = None
    rotation_angle: Optional[int] = None
    font_size_scale: Optional[float] = None
    text_color: Optional[str] = None
    stroke_color: Optional[str] = None
    stroke_width: Optional[int] = None


@router.post("", response_model=OCRBlockResponse, status_code=status.HTTP_201_CREATED)
async def create_ocr_block(
    payload: OCRBlockCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: StorageProvider = Depends(get_storage_provider),
    translator: TranslationProvider = Depends(get_translation_provider),
    ocr: OCRProvider = Depends(get_ocr_provider),
):
    page = session.get(Page, payload.page_id)
    if not page:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page introuvable.")
    project = session.get(Project, page.project_id)
    if not user_has_project_access(session, project, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")

    extracted_text = (payload.text or "").strip()
    if not extracted_text:
        try:
            image_bytes = storage.read(page.storage_key)
            img = Image.open(io.BytesIO(image_bytes))
            x1 = max(0, min(payload.bbox_x, img.width - 1))
            y1 = max(0, min(payload.bbox_y, img.height - 1))
            x2 = max(x1 + 1, min(payload.bbox_x + payload.bbox_w, img.width))
            y2 = max(y1 + 1, min(payload.bbox_y + payload.bbox_h, img.height))
            cropped = img.crop((x1, y1, x2, y2))
            buffer = io.BytesIO()
            cropped.save(buffer, format="PNG")
            detected = await ocr.detect_text(buffer.getvalue(), project.source_lang)
            raw_ocr = " ".join(b.text for b in detected).strip()
            if raw_ocr:
                extracted_text = " ".join(raw_ocr.split())
        except Exception:
            pass

    block = OCRBlock(
        page_id=page.id,
        text=extracted_text,
        bbox_x=payload.bbox_x,
        bbox_y=payload.bbox_y,
        bbox_w=payload.bbox_w,
        bbox_h=payload.bbox_h,
        bubble_type=payload.bubble_type or "B",
        manhwa_style=payload.manhwa_style or "dialogue",
        rotation_angle=payload.rotation_angle or 0,
        font_size_scale=payload.font_size_scale or 1.0,
        text_color=payload.text_color or "#0d0d0d",
        stroke_color=payload.stroke_color or "#ffffff",
        stroke_width=payload.stroke_width or 2,
        confidence=1.0 if extracted_text else 0.5,
        provider="manual",
    )
    session.add(block)
    session.commit()
    session.refresh(block)

    translation = None
    if extracted_text:
        try:
            translated_text = await translator.translate(extracted_text, project.source_lang, project.target_lang)
            translation = Translation(ocr_block_id=block.id, translated_text=translated_text, provider=getattr(translator, "last_provider", None) or "ollama")
            session.add(translation)
            session.commit()
            session.refresh(translation)
        except Exception:
            pass

    # Le commit de la traduction a expiré `block` : le recharger avant
    # de le sérialiser (dump d'une instance expirée = réponse vide = 500).
    session.refresh(block)
    tr_response = TranslationResponse(**translation.model_dump(mode="json")) if translation else None
    return OCRBlockResponse(**block.model_dump(mode="json"), translation=tr_response)


def _get_accessible_block(block_id: uuid.UUID, current_user: User, session: Session) -> tuple[OCRBlock, Project]:
    block = session.get(OCRBlock, block_id)
    page = session.get(Page, block.page_id) if block else None
    project = session.get(Project, page.project_id) if page else None
    if not block or not page or not user_has_project_access(session, project, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bloc introuvable.")
    return block, project


@router.patch("/{block_id}", response_model=OCRBlockResponse)
def update_ocr_block(
    block_id: uuid.UUID,
    payload: OCRBlockUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    block, _ = _get_accessible_block(block_id, current_user, session)
    if payload.text is not None:
        block.text = payload.text
    if payload.bbox_x is not None:
        block.bbox_x = payload.bbox_x
    if payload.bbox_y is not None:
        block.bbox_y = payload.bbox_y
    if payload.bbox_w is not None:
        block.bbox_w = payload.bbox_w
    if payload.bbox_h is not None:
        block.bbox_h = payload.bbox_h
    if payload.bubble_type is not None:
        block.bubble_type = payload.bubble_type
    if payload.manhwa_style is not None:
        block.manhwa_style = payload.manhwa_style
    if payload.rotation_angle is not None:
        block.rotation_angle = payload.rotation_angle
    if payload.font_size_scale is not None:
        block.font_size_scale = payload.font_size_scale
    if payload.text_color is not None:
        block.text_color = payload.text_color
    if payload.stroke_color is not None:
        block.stroke_color = payload.stroke_color
    if payload.stroke_width is not None:
        block.stroke_width = payload.stroke_width

    session.add(block)
    session.commit()
    session.refresh(block)

    translation = session.exec(select(Translation).where(Translation.ocr_block_id == block.id)).first()
    tr_response = TranslationResponse(**translation.model_dump(mode="json")) if translation else None

    return OCRBlockResponse(**block.model_dump(mode="json"), translation=tr_response)


@router.post("/{block_id}/retranslate", response_model=TranslationResponse)
async def retranslate_block(
    block_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    translator: TranslationProvider = Depends(get_translation_provider),
):
    block, project = _get_accessible_block(block_id, current_user, session)
    ensure_credits(current_user.id, CREDIT_COSTS["translate"], session)
    try:
        translated_text = await translator.translate(block.text, project.source_lang, project.target_lang)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Échec traduction : {exc}")

    translation = session.exec(select(Translation).where(Translation.ocr_block_id == block.id)).first()
    if translation:
        translation.translated_text = translated_text
        translation.edited_by_user = False
        translation.updated_at = datetime.now(timezone.utc)
    else:
        translation = Translation(ocr_block_id=block.id, translated_text=translated_text, provider=getattr(translator, "last_provider", None) or "ollama")

    session.add(translation)
    session.commit()
    deduct_credits(current_user.id, CREDIT_COSTS["translate"], "translate", session, project_id=project.id)
    session.refresh(translation)
    return TranslationResponse(**translation.model_dump(mode="json"))


@router.delete("/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ocr_block(
    block_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    block, _ = _get_accessible_block(block_id, current_user, session)
    session.exec(sql_delete(Translation).where(Translation.ocr_block_id == block.id))
    session.delete(block)
    session.commit()
    return None