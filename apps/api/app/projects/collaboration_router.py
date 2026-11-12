"""Routeur de Collaboration & Versioning par Page (Sections 18 & 19).

Fonctionnalités :
- Commentaires sur une page ou une bulle spécifique (ajout, liste, résolution, suppression)
- Historique de versions (snapshots JSON des blocs OCR, traductions et styles)
- Restauration non-destructive d'une version antérieure
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, delete, select

from app.auth.dependencies import get_current_user
from app.core.db import get_session
from app.models.collaboration import PageComment, PageVersion
from app.models.ocr_block import OCRBlock
from app.models.translation import Translation
from app.models.user import User
from app.projects.access import get_owned_page, get_owned_project

router = APIRouter(prefix="/projects/{project_id}", tags=["collaboration"])


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    ocr_block_id: uuid.UUID | None = None


class CommentUpdate(BaseModel):
    is_resolved: bool


class CommentResponse(BaseModel):
    id: str
    project_id: str
    page_id: str
    ocr_block_id: str | None = None
    author_id: str
    author_email: str
    content: str
    is_resolved: bool
    created_at: datetime


class VersionCreate(BaseModel):
    label: str = Field(default="", max_length=120)


class VersionResponse(BaseModel):
    id: str
    project_id: str
    page_id: str
    version_number: int
    label: str
    created_by_email: str
    blocks_count: int
    created_at: datetime


def _serialize_comment(c: PageComment) -> CommentResponse:
    return CommentResponse(
        id=str(c.id),
        project_id=str(c.project_id),
        page_id=str(c.page_id),
        ocr_block_id=str(c.ocr_block_id) if c.ocr_block_id else None,
        author_id=str(c.author_id),
        author_email=c.author_email,
        content=c.content,
        is_resolved=c.is_resolved,
        created_at=c.created_at,
    )


def _serialize_version(v: PageVersion) -> VersionResponse:
    try:
        parsed = json.loads(v.snapshot_json)
        blocks_count = len(parsed) if isinstance(parsed, list) else 0
    except Exception:
        blocks_count = 0
    return VersionResponse(
        id=str(v.id),
        project_id=str(v.project_id),
        page_id=str(v.page_id),
        version_number=v.version_number,
        label=v.label,
        created_by_email=v.created_by_email,
        blocks_count=blocks_count,
        created_at=v.created_at,
    )


@router.get("/pages/{page_id}/comments", response_model=list[CommentResponse])
def list_page_comments(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_page(session, project_id, page_id, current_user.id)
    comments = session.exec(
        select(PageComment)
        .where(PageComment.project_id == project_id, PageComment.page_id == page_id)
        .order_by(PageComment.created_at.asc())
    ).all()
    return [_serialize_comment(c) for c in comments]


@router.post(
    "/pages/{page_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_page_comment(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    payload: CommentCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_page(session, project_id, page_id, current_user.id)
    text = payload.content.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le commentaire ne peut pas être vide.",
        )
    comment = PageComment(
        project_id=project_id,
        page_id=page_id,
        ocr_block_id=payload.ocr_block_id,
        author_id=current_user.id,
        author_email=current_user.email,
        content=text,
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return _serialize_comment(comment)


@router.patch("/comments/{comment_id}", response_model=CommentResponse)
def update_page_comment(
    project_id: uuid.UUID,
    comment_id: uuid.UUID,
    payload: CommentUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_project(session, project_id, current_user.id)
    comment = session.get(PageComment, comment_id)
    if not comment or comment.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Commentaire introuvable."
        )
    comment.is_resolved = payload.is_resolved
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return _serialize_comment(comment)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_page_comment(
    project_id: uuid.UUID,
    comment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = get_owned_project(session, project_id, current_user.id)
    comment = session.get(PageComment, comment_id)
    if not comment or comment.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Commentaire introuvable."
        )
    if comment.author_id != current_user.id and project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul l'auteur du commentaire ou le propriétaire du projet peut le supprimer.",
        )
    session.delete(comment)
    session.commit()
    return None


def _build_page_snapshot(session: Session, page_id: uuid.UUID) -> str:
    blocks = session.exec(select(OCRBlock).where(OCRBlock.page_id == page_id)).all()
    snapshot = []
    for b in blocks:
        trans = session.exec(
            select(Translation).where(Translation.ocr_block_id == b.id)
        ).first()
        snapshot.append(
            {
                "text": b.text,
                "bbox_x": b.bbox_x,
                "bbox_y": b.bbox_y,
                "bbox_w": b.bbox_w,
                "bbox_h": b.bbox_h,
                "confidence": b.confidence,
                "provider": b.provider,
                "bubble_type": b.bubble_type,
                "manhwa_style": b.manhwa_style,
                "rotation_angle": b.rotation_angle,
                "font_size_scale": b.font_size_scale,
                "text_color": b.text_color,
                "stroke_color": b.stroke_color,
                "stroke_width": b.stroke_width,
                "translation": (
                    {
                        "translated_text": trans.translated_text,
                        "provider": trans.provider,
                        "edited_by_user": trans.edited_by_user,
                    }
                    if trans
                    else None
                ),
            }
        )
    return json.dumps(snapshot, ensure_ascii=False)


@router.get("/pages/{page_id}/versions", response_model=list[VersionResponse])
def list_page_versions(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_page(session, project_id, page_id, current_user.id)
    versions = session.exec(
        select(PageVersion)
        .where(PageVersion.project_id == project_id, PageVersion.page_id == page_id)
        .order_by(PageVersion.version_number.desc())
    ).all()
    return [_serialize_version(v) for v in versions]


@router.post(
    "/pages/{page_id}/versions",
    response_model=VersionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_page_version(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    payload: VersionCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_page(session, project_id, page_id, current_user.id)
    existing = session.exec(
        select(PageVersion)
        .where(PageVersion.project_id == project_id, PageVersion.page_id == page_id)
        .order_by(PageVersion.version_number.desc())
    ).first()
    next_num = (existing.version_number + 1) if existing else 1
    label = payload.label.strip() or f"Version {next_num}"
    snapshot_json = _build_page_snapshot(session, page_id)

    version = PageVersion(
        project_id=project_id,
        page_id=page_id,
        version_number=next_num,
        label=label,
        created_by_id=current_user.id,
        created_by_email=current_user.email,
        snapshot_json=snapshot_json,
    )
    session.add(version)
    session.commit()
    session.refresh(version)
    return _serialize_version(version)


@router.post(
    "/pages/{page_id}/versions/{version_id}/restore",
    response_model=VersionResponse,
)
def restore_page_version(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    version_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_page(session, project_id, page_id, current_user.id)
    target = session.get(PageVersion, version_id)
    if not target or target.project_id != project_id or target.page_id != page_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Version introuvable."
        )
    try:
        snapshot_blocks = json.loads(target.snapshot_json)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Snapshot de version invalide.",
        ) from exc

    # Remplace les blocs courants par ceux du snapshot restauré
    current_blocks = session.exec(
        select(OCRBlock).where(OCRBlock.page_id == page_id)
    ).all()
    for cb in current_blocks:
        session.exec(delete(Translation).where(Translation.ocr_block_id == cb.id))
        session.delete(cb)
    session.flush()

    for item in snapshot_blocks:
        new_block = OCRBlock(
            page_id=page_id,
            text=item.get("text", ""),
            bbox_x=int(item.get("bbox_x", 0)),
            bbox_y=int(item.get("bbox_y", 0)),
            bbox_w=int(item.get("bbox_w", 50)),
            bbox_h=int(item.get("bbox_h", 50)),
            confidence=float(item.get("confidence", 1.0)),
            provider=item.get("provider", "restored"),
            bubble_type=item.get("bubble_type", "B"),
            manhwa_style=item.get("manhwa_style", "dialogue"),
            rotation_angle=int(item.get("rotation_angle", 0)),
            font_size_scale=float(item.get("font_size_scale", 1.0)),
            text_color=item.get("text_color", "#0d0d0d"),
            stroke_color=item.get("stroke_color", "#ffffff"),
            stroke_width=int(item.get("stroke_width", 2)),
        )
        session.add(new_block)
        session.flush()
        trans_data = item.get("translation")
        if trans_data and trans_data.get("translated_text") is not None:
            session.add(
                Translation(
                    ocr_block_id=new_block.id,
                    translated_text=trans_data["translated_text"],
                    provider=trans_data.get("provider", "restored"),
                    edited_by_user=bool(trans_data.get("edited_by_user", False)),
                )
            )

    session.commit()
    return _serialize_version(target)
