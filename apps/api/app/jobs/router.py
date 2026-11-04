import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

import fitz
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.billing.router import CREDIT_COSTS, deduct_credits, ensure_credits
from app.core.db import engine, get_session
from app.models.cleaned_page import CleanedPage
from app.models.glossary import GlossaryEntry
from app.models.job import Job
from app.models.ocr_block import OCRBlock
from app.models.page import Page, page_display_order
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.subscription import ProjectMember
from app.models.translation import Translation
from app.models.user import User
from app.ocr.dependencies import get_ocr_provider
from app.projects.access import user_has_project_access
from app.projects.cleaning import clean_image
from app.projects.extraction import RENDER_DPI, get_image_dimensions, iter_pages_from_image
from app.projects.slicing import TARGET_SLICE_HEIGHT, is_webtoon_strip
from app.storage.dependencies import get_storage_provider
from app.translation.dependencies import get_translation_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])


def fail_orphaned_jobs() -> int:
    """Marque « failed » les jobs restés pending/running en base.

    Un crash du processus (typiquement l'OOM 512 Mo de l'offre gratuite
    Render) tue les tâches d'arrière-plan sans mettre à jour leur ligne :
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
    storage = get_storage_provider()
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
        job = session.get(Job, job_id)
        if not job:
            return
        session.refresh(job)
        if job.status == "cancelled":
            return
        job.status = "running"
        job.message = "Préparation de l’extraction…"
        session.add(job)
        session.commit()

        try:
            source_file = session.get(SourceFile, file_id)
            if not source_file or source_file.project_id != job.project_id:
                raise ValueError("Le fichier source est introuvable.")
            if session.exec(
                select(Page).where(Page.source_file_id == source_file.id)
            ).first():
                raise ValueError("Ce fichier a déjà été extrait en pages.")

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
    storage = get_storage_provider()
    ocr = get_ocr_provider()
    translator = get_translation_provider()

    with Session(engine) as session:
        job = session.get(Job, job_id)
        if not job:
            return

        job.status = "running"
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


@router.post("/projects/{project_id}/start-batch", status_code=status.HTTP_202_ACCEPTED)
def start_batch_job(
    project_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Démarre le traitement global du chapitre en tâche d'arrière-plan sans timeout."""
    project = session.get(Project, project_id)
    if not user_has_project_access(session, project, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")

    job = Job(
        project_id=project.id,
        user_id=current_user.id,
        job_type="batch_process",
        status="pending",
        message="Démarrage de la tâche...",
    )
    session.add(job)
    session.commit()
    session.refresh(job)

    background_tasks.add_task(_run_batch_in_background, job.id)

    return {
        "job_id": str(job.id),
        "status": job.status,
        "message": "Traitement du chapitre lancé en arrière-plan.",
    }


@router.post(
    "/projects/{project_id}/files/{file_id}/start-extraction",
    status_code=status.HTTP_202_ACCEPTED,
)
def start_extraction_job(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")
    if project.owner_id != current_user.id:
        membership = session.exec(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id,
            )
        ).first()
        if not membership:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")

    source_file = session.get(SourceFile, file_id)
    if not source_file or source_file.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichier introuvable.")
    if session.exec(
        select(Page).where(Page.source_file_id == source_file.id)
    ).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce fichier a déjà été extrait en pages.",
        )
    active_job = session.exec(
        select(Job).where(
            Job.project_id == project_id,
            Job.job_type == "extract_pages",
            Job.status.in_(["pending", "running"]),
        )
    ).first()
    if active_job:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Une extraction est déjà en cours pour ce projet.",
        )

    job = Job(
        project_id=project_id,
        user_id=current_user.id,
        job_type="extract_pages",
        status="pending",
        message="Extraction en attente…",
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    background_tasks.add_task(_run_extraction_in_background, job.id, file_id)
    return {
        "job_id": str(job.id),
        "status": job.status,
        "message": "Extraction lancée en arrière-plan.",
    }


@router.get("/{job_id}")
def get_job_status(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Retourne l'état courant et l'avancement d'une tâche."""
    job = session.get(Job, job_id)
    if not job or (
        job.user_id != current_user.id
        and not user_has_project_access(
            session, session.get(Project, job.project_id), current_user.id
        )
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tâche introuvable.")

    return {
        "id": str(job.id),
        "project_id": str(job.project_id),
        "status": job.status,
        "current_page": job.current_page,
        "total_pages": job.total_pages,
        "progress_percent": job.progress_percent,
        "message": job.message,
        "error_message": job.error_message,
        "completed_at": job.completed_at,
    }


@router.post("/{job_id}/cancel")
def cancel_job(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Arrête immédiatement l'exécution d'une tâche en cours."""
    job = session.get(Job, job_id)
    if not job or (
        job.user_id != current_user.id
        and not user_has_project_access(
            session, session.get(Project, job.project_id), current_user.id
        )
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tâche introuvable.")

    job.status = "cancelled"
    job.message = "Tâche interrompue par l'utilisateur."
    session.add(job)
    session.commit()
    return {"status": "cancelled", "message": "Traitement arrêté."}


@router.get("/{job_id}/stream")
async def stream_job_progress(
    job_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """Flux Server-Sent Events (SSE) diffusant en direct l'avancement de la tâche."""
    async def event_generator():
        while True:
            with Session(engine) as fresh_session:
                job = fresh_session.get(Job, job_id)
                if not job:
                    yield f"data: {json.dumps({'error': 'Tâche introuvable'})}\n\n"
                    break

                payload = {
                    "id": str(job.id),
                    "status": job.status,
                    "current_page": job.current_page,
                    "total_pages": job.total_pages,
                    "progress_percent": job.progress_percent,
                    "message": job.message,
                }
                yield f"data: {json.dumps(payload)}\n\n"

                if job.status in ("completed", "failed", "cancelled"):
                    break

            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )