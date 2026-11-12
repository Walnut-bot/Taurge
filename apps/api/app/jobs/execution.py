import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

import fitz
from fastapi import HTTPException, status
from sqlalchemy import update as sa_update
from sqlmodel import Session, delete, select

from app.billing.router import CREDIT_COSTS, deduct_credits, ensure_credits
from app.core.db import engine
from app.models.cleaned_page import CleanedPage
from app.models.glossary import GlossaryEntry
from app.models.job import Job
from app.models.ocr_block import OCRBlock
from app.models.page import Page, page_display_order
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.translation import Translation
from app.projects.cleaning import clean_image
from app.projects.extraction import (
    RENDER_DPI,
    get_image_dimensions,
    iter_pages_from_archive,
    iter_pages_from_image,
)
from app.projects.slicing import TARGET_SLICE_HEIGHT, is_webtoon_strip
from app.projects.thumbnails import ensure_page_thumbnail, thumbnail_key

logger = logging.getLogger(__name__)


def _storage_provider():
    try:
        from app.jobs.router import get_storage_provider
        return get_storage_provider()
    except Exception:
        from app.storage.dependencies import get_storage_provider as _f
        return _f()


def _ocr_provider():
    try:
        from app.jobs.router import get_ocr_provider
        return get_ocr_provider()
    except Exception:
        from app.ocr.dependencies import get_ocr_provider as _f
        return _f()


def _translation_provider():
    try:
        from app.jobs.router import get_translation_provider
        return get_translation_provider()
    except Exception:
        from app.translation.dependencies import get_translation_provider as _f
        return _f()


def fail_orphaned_jobs() -> int:
    """Marque « failed » les jobs restés pending/running en base.

    Un crash du processus (typiquement l'OOM 512 Mo de l'offre gratuite
    du processus) tue les tâches d'arrière-plan sans mettre à jour leur ligne :
    au redémarrage, elles resteraient « running » pour toujours et le
    frontend bouclerait sur « Connection lost while tracking ». Comme
    l'API tourne en une seule instance, tout job non terminé au
    démarrage est forcément orphelin. Retourne leur nombre.
    """
    with Session(engine) as session:
        orphaned = session.exec(
            select(Job).where(Job.status.in_(["pending", "running"]))
        ).all()
        for job in orphaned:
            job.status = "failed"
            job.message = (
                "Traitement interrompu (redémarrage du serveur). "
                "Relancez l'opération."
            )
            job.error_message = "orphaned_after_restart"
            job.completed_at = datetime.now(timezone.utc)
            session.add(job)
        session.commit()
        return len(orphaned)


def _claim_job(session: Session, job_id: uuid.UUID) -> bool:
    """Réclame atomiquement un job `pending` (pending -> running).

    Empêche la double exécution entre la BackgroundTask de la requête
    et le worker DB : un seul des deux obtient la transition.
    """
    result = session.execute(
        sa_update(Job)
        .where(Job.id == job_id, Job.status == "pending")
        .values(status="running", updated_at=datetime.now(timezone.utc))
    )
    session.commit()
    return bool(result.rowcount)


def recover_interrupted_jobs() -> int:
    """Reprend (au lieu d'échouer) les jobs interrompus par un arrêt.

    Les `running` redeviennent `pending` : le worker DB les réclamera.
    Les `pending` le sont déjà. `fail_orphaned_jobs` reste disponible
    (compat/tests) mais n'est plus le comportement au démarrage.
    """
    with Session(engine) as session:
        interrupted = session.exec(
            select(Job).where(Job.status == "running")
        ).all()
        for job in interrupted:
            job.status = "pending"
            job.message = "Reprise du traitement après redémarrage…"
            job.error_message = None
            job.completed_at = None
            session.add(job)
        session.commit()
        return len(interrupted)


def _set_extraction_job_progress(
    session: Session,
    job: Job,
    *,
    current: int,
    total: int,
    message: str,
) -> None:
    job.current_page = current
    job.total_pages = total
    job.progress_percent = int(current / total * 100) if total else 0
    job.message = message
    session.add(job)
    session.commit()


def _run_extraction_in_background(job_id: uuid.UUID, file_id: uuid.UUID) -> None:
    storage = _storage_provider()
    generated_storage_keys: list[str] = []
    generated_page_ids: list[uuid.UUID] = []

    def remove_partial_extraction(session: Session) -> None:
        for key in generated_storage_keys:
            try:
                storage.delete(key)
            except OSError:
                logger.exception("Impossible de supprimer la page temporaire %s.", key)
        for page_id in generated_page_ids:
            page = session.get(Page, page_id)
            if page:
                session.delete(page)
        session.commit()

    with Session(engine) as session:
        if not _claim_job(session, job_id):
            import time
            deadline = time.monotonic() + 10.0
            while time.monotonic() < deadline:
                session.expire_all()
                current = session.get(Job, job_id)
                if not current or current.status != "running":
                    break
                time.sleep(0.05)
            return
        job = session.get(Job, job_id)
        if not job:
            return
        job.message = "Préparation de l’extraction…"
        session.add(job)
        session.commit()

        try:
            source_file = session.get(SourceFile, file_id)
            if not source_file or source_file.project_id != job.project_id:
                raise ValueError("Le fichier source est introuvable.")
            # Reprise après crash : un job réclamé alors que des pages
            # existent déjà est une extraction interrompue (pages
            # commitées au fil de l'eau). On purge ce partiel et on
            # ré-extrait proprement au lieu d'échouer en laissant des
            # pages orphelines.
            existing_pages = session.exec(
                select(Page).where(Page.source_file_id == source_file.id)
            ).all()
            if existing_pages:
                logger.warning(
                    "Reprise d'extraction du fichier %s : %s page(s) partielle(s) purgée(s).",
                    source_file.id, len(existing_pages),
                )
                for old_page in existing_pages:
                    for key in (old_page.storage_key, thumbnail_key(old_page.project_id, old_page.id)):
                        if key and key != source_file.storage_key:
                            try:
                                storage.delete(key)
                            except OSError:
                                logger.exception("Impossible de supprimer %s.", key)
                    session.delete(old_page)
                session.commit()

            if source_file.file_type == "pdf":
                # Ouverture depuis le disque quand le stockage est local :
                # fitz lit le fichier a la demande au lieu de charger tout
                # le PDF en RAM (un chapitre peut peser des dizaines de Mo,
                # de quoi depasser un plafond memoire de 512 Mo).
                pdf_path = (
                    storage.path_for(source_file.storage_key)
                    if hasattr(storage, "path_for")
                    else None
                )
                document_ctx = (
                    fitz.open(pdf_path)
                    if pdf_path is not None
                    else fitz.open(
                        stream=storage.read(source_file.storage_key), filetype="pdf"
                    )
                )
                zoom = RENDER_DPI / 72
                matrix = fitz.Matrix(zoom, zoom)
                with document_ctx as document:
                    total = document.page_count
                    if total == 0:
                        raise ValueError("Le PDF ne contient aucune page.")
                    _set_extraction_job_progress(
                        session, job, current=0, total=total,
                        message=f"Extraction de {total} pages\u2026",
                    )
                    for index in range(total):
                        session.refresh(job)
                        if job.status == "cancelled":
                            remove_partial_extraction(session)
                            return
                        page_document = document.load_page(index)
                        pixmap = page_document.get_pixmap(matrix=matrix)
                        page = Page(
                            project_id=job.project_id,
                            source_file_id=source_file.id,
                            page_number=index + 1,
                            storage_key="",
                            width=pixmap.width,
                            height=pixmap.height,
                        )
                        page.storage_key = f"pages/{job.project_id}/{page.id}.png"
                        generated_page_ids.append(page.id)
                        generated_storage_keys.append(page.storage_key)
                        storage.save(page.storage_key, pixmap.tobytes("png"))
                        # Libere le tampon brut avant la page suivante :
                        # seule la page en cours doit vivre en memoire.
                        pixmap = None
                        page_document = None
                        session.add(page)
                        _set_extraction_job_progress(
                            session, job, current=index + 1, total=total,
                            message=f"Extraction de la page {index + 1}/{total}\u2026",
                        )
            elif source_file.file_type in ("zip", "cbz"):
                content = storage.read(source_file.storage_key)
                _set_extraction_job_progress(
                    session, job, current=0, total=1,
                    message="Extraction de l\u2019archive ZIP/CBZ\u2026",
                )
                created = 0
                for index, (image_bytes, width, height) in enumerate(
                    iter_pages_from_archive(content), start=1
                ):
                    session.refresh(job)
                    if job.status == "cancelled":
                        remove_partial_extraction(session)
                        return
                    page = Page(
                        project_id=job.project_id,
                        source_file_id=source_file.id,
                        page_number=index,
                        storage_key="",
                        width=width,
                        height=height,
                    )
                    page.storage_key = f"pages/{job.project_id}/{page.id}.png"
                    generated_storage_keys.append(page.storage_key)
                    generated_page_ids.append(page.id)
                    storage.save(page.storage_key, image_bytes)
                    session.add(page)
                    created = index
                    _set_extraction_job_progress(
                        session, job, current=index, total=max(index, 1),
                        message=f"Extraction de la page {index} depuis l\u2019archive\u2026",
                    )
                if created == 0:
                    raise ValueError("Aucune page n\u2019a pu etre extraite de l\u2019archive.")
                total = created
            else:
                content = storage.read(source_file.storage_key)
                img_width, img_height = get_image_dimensions(content)
                single_image = not is_webtoon_strip(img_width, img_height)
                if single_image:
                    total = 1
                    slices_iter = iter([(content, img_width, img_height)])
                else:
                    # Total estime pour la progression ; les tranches
                    # reelles sont produites et ecrites une par une.
                    total = max(1, img_height // TARGET_SLICE_HEIGHT)
                    slices_iter = iter_pages_from_image(content)
                _set_extraction_job_progress(
                    session, job, current=0, total=total,
                    message=f"Preparation de {total} page(s)\u2026",
                )
                created = 0
                for index, (image_bytes, width, height) in enumerate(slices_iter, start=1):
                    session.refresh(job)
                    if job.status == "cancelled":
                        remove_partial_extraction(session)
                        return
                    page = Page(
                        project_id=job.project_id,
                        source_file_id=source_file.id,
                        page_number=index,
                        storage_key="",
                        width=width,
                        height=height,
                    )
                    if single_image:
                        page.storage_key = source_file.storage_key
                    else:
                        page.storage_key = f"pages/{job.project_id}/{page.id}.png"
                        generated_storage_keys.append(page.storage_key)
                        storage.save(page.storage_key, image_bytes)
                    generated_page_ids.append(page.id)
                    session.add(page)
                    created = index
                    _set_extraction_job_progress(
                        session, job, current=index, total=total,
                        message=f"Preparation de la page {index}/{total}\u2026",
                    )
                if created == 0:
                    raise ValueError("Aucune page n\u2019a pu etre extraite de l\u2019image.")
                total = created

            session.refresh(job)
            if job.status == "cancelled":
                remove_partial_extraction(session)
                return
            for _pid in list(generated_page_ids):
                _pg = session.get(Page, _pid)
                if _pg is not None:
                    try:
                        ensure_page_thumbnail(storage, _pg)
                    except Exception:
                        logger.exception("Miniature non generee pour la page %s", _pid)
            job.status = "completed"
            job.progress_percent = 100
            job.message = f"Extraction terminée : {total} page(s)."
            job.completed_at = datetime.now(timezone.utc)
            session.add(job)
            session.commit()
        except Exception as exc:
            logger.exception("Échec de l’extraction pour la tâche %s.", job_id)
            session.rollback()
            remove_partial_extraction(session)
            failed_job = session.get(Job, job_id)
            if failed_job:
                failed_job.status = "failed"
                failed_job.error_message = str(exc)
                failed_job.message = f"Échec de l’extraction : {exc}"
                failed_job.completed_at = datetime.now(timezone.utc)
                session.add(failed_job)
                session.commit()


async def _run_batch_in_background(job_id: uuid.UUID):
    """Exécute l'OCR, la traduction IA et le nettoyage page par page en arrière-plan."""
    storage = _storage_provider()
    ocr = _ocr_provider()
    translator = _translation_provider()

    with Session(engine) as session:
        if not _claim_job(session, job_id):
            import time
            deadline = time.monotonic() + 10.0
            while time.monotonic() < deadline:
                session.expire_all()
                current = session.get(Job, job_id)
                if not current or current.status != "running":
                    break
                time.sleep(0.05)
            return
        job = session.get(Job, job_id)
        if not job:
            return

        job.message = "Initialisation du traitement..."
        session.add(job)
        session.commit()

        project = session.get(Project, job.project_id)
        pages = session.exec(
            select(Page).where(Page.project_id == job.project_id).order_by(*page_display_order())
        ).all()

        job.total_pages = len(pages)
        session.add(job)
        session.commit()

        if not pages:
            job.status = "completed"
            job.progress_percent = 100
            job.message = "Aucune page à traiter."
            session.add(job)
            session.commit()
            return

        glossary_entries = session.exec(
            select(GlossaryEntry).where(GlossaryEntry.project_id == project.id)
        ).all()
        glossary_map = {g.source_term: g.target_term for g in glossary_entries if g.is_locked}

        for idx, page in enumerate(pages, start=1):
            session.refresh(job)
            if job.status == "cancelled":
                logger.info("Tâche %s annulée par l'utilisateur.", job_id)
                return

            job.current_page = idx
            job.progress_percent = int(((idx - 1) / len(pages)) * 100)
            job.message = f"Traitement de la page {idx}/{len(pages)}..."
            session.add(job)
            session.commit()

            try:
                # 1. OCR si absent
                blocks = session.exec(select(OCRBlock).where(OCRBlock.page_id == page.id)).all()
                if not blocks:
                    ensure_credits(job.user_id, CREDIT_COSTS["ocr"], session)
                    image_bytes = storage.read(page.storage_key)
                    detected = await ocr.detect_text(image_bytes, project.source_lang)
                    for d in detected:
                        session.add(OCRBlock(
                            page_id=page.id,
                            text=d.text,
                            bbox_x=d.bbox_x,
                            bbox_y=d.bbox_y,
                            bbox_w=d.bbox_w,
                            bbox_h=d.bbox_h,
                            confidence=d.confidence,
                            provider=d.provider,
                        ))
                    session.commit()
                    deduct_credits(job.user_id, CREDIT_COSTS["ocr"], "ocr", session, project_id=project.id)
                    blocks = session.exec(select(OCRBlock).where(OCRBlock.page_id == page.id)).all()

                # 2. Traduction
                if blocks:
                    already_trans = {
                        t.ocr_block_id
                        for t in session.exec(
                            select(Translation).where(
                                Translation.ocr_block_id.in_([b.id for b in blocks])
                            )
                        ).all()
                    }
                    to_trans = [b for b in blocks if b.id not in already_trans]
                    if to_trans:
                        ensure_credits(job.user_id, CREDIT_COSTS["translate"], session)
                        texts = [b.text for b in to_trans]
                        translated = await translator.translate_batch(
                            texts, project.source_lang, project.target_lang, glossary=glossary_map
                        )
                        for block, trans_text in zip(to_trans, translated):
                            session.add(Translation(
                                ocr_block_id=block.id,
                                translated_text=trans_text,
                                provider=getattr(translator, "last_provider", None) or "ollama",
                            ))
                        session.commit()

                        deduct_credits(job.user_id, CREDIT_COSTS["translate"], "translate", session, project_id=project.id)
                # 3. Nettoyage inpainting
                cleaned = session.exec(select(CleanedPage).where(CleanedPage.page_id == page.id)).first()
                if not cleaned and blocks:
                    ensure_credits(job.user_id, CREDIT_COSTS["clean"], session)
                    orig_bytes = storage.read(page.storage_key)
                    bboxes = [(b.bbox_x, b.bbox_y, b.bbox_w, b.bbox_h) for b in blocks]
                    cleaned_bytes = clean_image(orig_bytes, bboxes)
                    storage_key = f"cleaned/{project.id}/{page.id}.png"
                    storage.save(storage_key, cleaned_bytes)
                    session.add(CleanedPage(page_id=page.id, storage_key=storage_key))
                    # Note : deduct_credits() committe aussi l'insert ci-dessus.
                    deduct_credits(job.user_id, CREDIT_COSTS["clean"], "clean", session, project_id=project.id)
                    session.commit()

            except Exception as exc:
                if isinstance(exc, HTTPException) and exc.status_code == status.HTTP_402_PAYMENT_REQUIRED:
                    session.rollback()
                    job.status = "failed"
                    job.message = "Crédits insuffisants — tâche interrompue. Rechargez puis relancez."
                    job.error_message = str(exc.detail)
                    job.completed_at = datetime.now(timezone.utc)
                    session.add(job)
                    session.commit()
                    logger.warning("Tâche %s interrompue : crédits épuisés.", job_id)
                    return
                logger.warning("Erreur non bloquante sur la page %s: %s", page.page_number, exc)
                session.rollback()

        job.status = "completed"
        job.current_page = len(pages)
        job.progress_percent = 100
        job.message = f"Chapitre terminé avec succès ({len(pages)} pages) !"
        job.completed_at = datetime.now(timezone.utc)
        session.add(job)
        session.commit()


async def _run_page_ocr(job_id: uuid.UUID, page_id: uuid.UUID) -> None:
    """OCR d'une page en arrière-plan (aucun timeout HTTP).

    Avant, l'OCR d'une page tenait une requête HTTP synchrone : au
    premier lancement, le moteur télécharge/charge ses modèles
    (premier lancement), et une page lourde prenait des minutes
    — le client expirait à 300 s et l'API entière semblait morte.
    Ici le job avance en tâche de fond, avec les mêmes règles que
    l'endpoint synchrone : purge des anciens blocs seulement après
    une détection réussie, crédits débités seulement en cas de succès.
    """
    storage = _storage_provider()
    ocr = _ocr_provider()
    with Session(engine) as session:
        if not _claim_job(session, job_id):
            import time
            deadline = time.monotonic() + 10.0
            while time.monotonic() < deadline:
                session.expire_all()
                current = session.get(Job, job_id)
                if not current or current.status != "running":
                    break
                time.sleep(0.05)
            return
        job = session.get(Job, job_id)
        if not job:
            return
        job.total_pages = 1
        job.current_page = 0
        job.progress_percent = 10
        job.message = "Chargement du moteur OCR (premier lancement plus long)…"
        session.add(job)
        session.commit()
        try:
            project = session.get(Project, job.project_id)
            page = session.get(Page, page_id)
            if not project or not page or page.project_id != project.id:
                raise ValueError("Page ou projet introuvable.")
            ensure_credits(job.user_id, CREDIT_COSTS["ocr"], session)
            image_bytes = storage.read(page.storage_key)
            detected = await ocr.detect_text(image_bytes, project.source_lang)
            session.refresh(job)
            if job.status == "cancelled":
                return
            for block in session.exec(
                select(OCRBlock).where(OCRBlock.page_id == page.id)
            ).all():
                session.exec(
                    delete(Translation).where(Translation.ocr_block_id == block.id)
                )
                session.delete(block)
            for data in detected:
                session.add(OCRBlock(
                    page_id=page.id, text=data.text, bbox_x=data.bbox_x,
                    bbox_y=data.bbox_y, bbox_w=data.bbox_w, bbox_h=data.bbox_h,
                    confidence=data.confidence, provider=data.provider,
                ))
            session.commit()
            deduct_credits(job.user_id, CREDIT_COSTS["ocr"], "ocr", session, project_id=project.id)
            job.status = "completed"
            job.current_page = 1
            job.progress_percent = 100
            job.message = f"OCR terminé : {len(detected)} bloc(s) détecté(s)."
            job.completed_at = datetime.now(timezone.utc)
            session.add(job)
            session.commit()
        except Exception as exc:
            logger.exception("Échec OCR page pour le job %s.", job_id)
            session.rollback()
            failed = session.get(Job, job_id)
            if failed and failed.status != "cancelled":
                failed.status = "failed"
                failed.error_message = str(exc)
                failed.message = f"Échec de l'OCR : {exc}"
                failed.completed_at = datetime.now(timezone.utc)
                session.add(failed)
                session.commit()


def _run_page_ocr_in_thread(job_id: uuid.UUID, page_id: uuid.UUID) -> None:
    asyncio.run(_run_page_ocr(job_id, page_id))


