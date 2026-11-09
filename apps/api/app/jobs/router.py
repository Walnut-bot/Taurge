"""Routeur mince des jobs : HTTP/SSE uniquement.

L'exécution (extraction, batch, OCR page) vit dans app.jobs.execution.
Ce module ré-exporte ses symboles pour compatibilité (tests, worker,
main) : monkeypatcher ``jobs_router.get_ocr_provider`` reste effectif
car execution résout les providers via ce module au moment de l'appel.
"""
import asyncio
import json
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.core.db import engine, get_session
from app.jobs.execution import (
    _claim_job, _run_batch_in_background, _run_extraction_in_background,
    _run_page_ocr, _run_page_ocr_in_thread, _set_extraction_job_progress,
    fail_orphaned_jobs, recover_interrupted_jobs,
)
from app.models.job import Job
from app.models.page import Page
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.user import User
from app.ocr.dependencies import get_ocr_provider
from app.projects.access import user_has_project_access
from app.storage.dependencies import get_storage_provider
from app.translation.dependencies import get_translation_provider

__all__ = [
    "router", "fail_orphaned_jobs", "recover_interrupted_jobs", "_claim_job",
    "_run_batch_in_background", "_run_extraction_in_background",
    "_run_page_ocr", "_run_page_ocr_in_thread", "get_ocr_provider",
    "get_translation_provider", "get_storage_provider",
]

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/projects/{project_id}/start-batch", status_code=status.HTTP_202_ACCEPTED)
def start_batch_job(project_id: uuid.UUID, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Démarre le traitement global du chapitre en tâche d'arrière-plan sans timeout."""
    project = session.get(Project, project_id)
    if not user_has_project_access(session, project, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")
    job = Job(project_id=project.id, user_id=current_user.id, job_type="batch_process", status="pending", message="Démarrage de la tâche...")
    session.add(job)
    session.commit()
    session.refresh(job)
    from app.jobs.dispatch import dispatch_job_via_celery
    if not dispatch_job_via_celery("batch_process", job.id):
        background_tasks.add_task(_run_batch_in_background, job.id)
    return {"job_id": str(job.id), "status": job.status, "message": "Traitement du chapitre lancé en arrière-plan."}


@router.post("/projects/{project_id}/files/{file_id}/start-extraction", status_code=status.HTTP_202_ACCEPTED)
def start_extraction_job(project_id: uuid.UUID, file_id: uuid.UUID, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not user_has_project_access(session, project, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")
    source_file = session.get(SourceFile, file_id)
    if not source_file or source_file.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichier introuvable.")
    if session.exec(select(Page).where(Page.source_file_id == source_file.id)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce fichier a déjà été extrait en pages.")
    active_job = session.exec(select(Job).where(Job.project_id == project_id, Job.job_type == "extract_pages", Job.status.in_(["pending", "running"]))).first()
    if active_job:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Une extraction est déjà en cours pour ce projet.")
    job = Job(project_id=project_id, user_id=current_user.id, job_type="extract_pages", status="pending", message="Extraction en attente…", source_file_id=file_id)
    session.add(job)
    session.commit()
    session.refresh(job)
    from app.jobs.dispatch import dispatch_job_via_celery
    if not dispatch_job_via_celery("extract_pages", job.id, source_file_id=file_id):
        background_tasks.add_task(_run_extraction_in_background, job.id, file_id)
    return {"job_id": str(job.id), "status": job.status, "message": "Extraction lancée en arrière-plan."}


@router.post("/projects/{project_id}/pages/{page_id}/start-ocr", status_code=status.HTTP_202_ACCEPTED)
def start_page_ocr_job(project_id: uuid.UUID, page_id: uuid.UUID, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Lance l'OCR d'une page en arrière-plan et renvoie le job à suivre."""
    project = session.get(Project, project_id)
    if not user_has_project_access(session, project, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")
    page = session.get(Page, page_id)
    if not page or page.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page introuvable.")
    active = session.exec(select(Job).where(Job.project_id == project_id, Job.page_id == page_id, Job.job_type == "ocr_page", Job.status.in_(["pending", "running"]))).first()
    if active:
        return {"job_id": str(active.id), "status": active.status, "message": "OCR déjà en cours pour cette page."}
    job = Job(project_id=project_id, user_id=current_user.id, page_id=page_id, job_type="ocr_page", status="pending", message="OCR en attente…", total_pages=1)
    session.add(job)
    session.commit()
    session.refresh(job)
    from app.jobs.dispatch import dispatch_job_via_celery
    if not dispatch_job_via_celery("ocr_page", job.id, page_id=page_id):
        background_tasks.add_task(_run_page_ocr_in_thread, job.id, page_id)
    return {"job_id": str(job.id), "status": job.status, "message": "OCR lancé en arrière-plan."}


def _get_job_for_user(job_id: uuid.UUID, current_user: User, session: Session) -> Job:
    job = session.get(Job, job_id)
    if not job or (job.user_id != current_user.id and not user_has_project_access(session, session.get(Project, job.project_id), current_user.id)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tâche introuvable.")
    return job


@router.get("/{job_id}")
def get_job_status(job_id: uuid.UUID, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Retourne l'état courant et l'avancement d'une tâche."""
    job = _get_job_for_user(job_id, current_user, session)
    return {"id": str(job.id), "project_id": str(job.project_id), "status": job.status, "current_page": job.current_page, "total_pages": job.total_pages, "progress_percent": job.progress_percent, "message": job.message, "error_message": job.error_message, "completed_at": job.completed_at}


@router.post("/{job_id}/cancel")
def cancel_job(job_id: uuid.UUID, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Arrête immédiatement l'exécution d'une tâche en cours."""
    job = _get_job_for_user(job_id, current_user, session)
    job.status = "cancelled"
    job.message = "Tâche interrompue par l'utilisateur."
    session.add(job)
    session.commit()
    return {"status": "cancelled", "message": "Traitement arrêté."}


@router.get("/{job_id}/stream")
async def stream_job_progress(job_id: uuid.UUID, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Flux Server-Sent Events (SSE) diffusant en direct l'avancement de la tâche."""
    _get_job_for_user(job_id, current_user, session)

    async def event_generator():
        while True:
            with Session(engine) as fresh_session:
                job = fresh_session.get(Job, job_id)
                if not job:
                    yield f"data: {json.dumps({'error': 'Tâche introuvable'})}\n\n"
                    break
                payload = {"id": str(job.id), "status": job.status, "current_page": job.current_page, "total_pages": job.total_pages, "progress_percent": job.progress_percent, "message": job.message}
                yield f"data: {json.dumps(payload)}\n\n"
                if job.status in ("completed", "failed", "cancelled"):
                    break
            await asyncio.sleep(1.0)

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})
