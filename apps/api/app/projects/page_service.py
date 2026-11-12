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
from app.projects.extraction import (
    get_image_dimensions,
    iter_pages_from_archive,
    iter_pages_from_image,
    iter_pages_from_pdf,
)
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


def extract_pages(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    current_user: User,
    session: Session,
    storage: StorageProvider,
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
            iter_pages_from_pdf(content), start=1
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
    elif source_file.file_type in ("zip", "cbz"):
        try:
            for index, (png_bytes, width, height) in enumerate(
                iter_pages_from_archive(content), start=1
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
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
    else:
        # Image déjà uploadée : si c'est une bande webtoon longue, on la découpe
        # intelligemment aux gouttières pour créer plusieurs pages séquentielles.
        # Sinon, on conserve la page unique.
        img_width, img_height = get_image_dimensions(content)
        slices = iter_pages_from_image(content) if is_webtoon_strip(img_width, img_height) else None
        if slices is not None:
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
            width, height = img_width, img_height
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

    for _p in created_pages:
        try:
            ensure_page_thumbnail(storage, _p)
        except Exception:
            logger.exception('Miniature non generee pour la page %s', _p.id)
    return [PageResponse(**p.model_dump(mode="json"), thumbnail_url=thumbnail_url_for(p.id)) for p in created_pages]


async def run_ocr(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    current_user: User,
    session: Session,
    storage: StorageProvider,
    ocr: OCRProvider,
):
    project = _get_owned_project(project_id, current_user, session)
    page = _get_owned_page(project_id, page_id, current_user, session)

    ensure_credits(current_user.id, CREDIT_COSTS["ocr"], session)

    image_bytes = _read_storage_or_404(storage, page.storage_key, f"L'image de la page {page.page_number}")

    try:
        detected = await ocr.detect_text(image_bytes, project.source_lang)
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)
        )
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


async def translate_page(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    current_user: User,
    session: Session,
    translator: TranslationProvider,
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


def clean_page(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    current_user: User,
    session: Session,
    storage: StorageProvider,
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
        thumbnail_url=thumbnail_url_for(page.id),
    )


async def batch_process_project(
    project_id: uuid.UUID,
    include_ocr: bool,
    include_translate: bool,
    include_clean: bool,
    current_user: User,
    session: Session,
    storage: StorageProvider,
    ocr: OCRProvider,
    translator: TranslationProvider,
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


async def process_page_full(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    include_ocr: bool,
    include_translate: bool,
    include_clean: bool,
    current_user: User,
    session: Session,
    storage: StorageProvider,
    ocr: OCRProvider,
    translator: TranslationProvider,
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
        thumbnail_url=thumbnail_url_for(page.id),
    )


