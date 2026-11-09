"""Worker de file persistante adossé à la table `jobs`.

Deux modes d'exécution, aiguillés par app.jobs.dispatch :
- Celery + Redis (dès que le broker répond, USE_CELERY=auto) : ce
  thread ne fait qu'enfiler les jobs `pending`, le processus worker
  Celery dédié les exécute (`celery -A app.jobs.celery_app worker`) ;
- repli intégré (aucun Redis) : ce thread exécute lui-même les jobs.

Dans les deux cas, la file survit aux redémarrages (les `running`
interrompus, repassés `pending` au démarrage, sont repris) et le
claim atomique (`_claim_job`) rend l'exécution unique, même si
plusieurs canaux déclenchent le même job.
"""
import asyncio
import logging
import threading

from sqlmodel import Session, select

from app.core.db import engine
from app.models.job import Job

logger = logging.getLogger(__name__)

_stop_event = threading.Event()
_thread: threading.Thread | None = None
_lock = threading.Lock()
_POLL_SECONDS = 0.5


def _dispatch(job: Job) -> None:
    # Celery d'abord si le broker Redis répond : le job part dans le
    # processus worker dédié. Sinon, exécution locale par ce thread
    # (comportement historique, aucun prérequis externe).
    from app.jobs.dispatch import dispatch_job_via_celery

    file_id = job.source_file_id
    if job.job_type == "extract_pages" and file_id is None:
        file_id = _legacy_extraction_file(job)
    if dispatch_job_via_celery(
        job.job_type, job.id, page_id=job.page_id, source_file_id=file_id
    ):
        return
    # Import différé : l'exécution vit dans app.jobs.execution,
    # séparée du routeur HTTP/SSE (app.jobs.router la ré-exporte).
    from app.jobs.execution import (
        _run_batch_in_background,
        _run_extraction_in_background,
        _run_page_ocr_in_thread,
    )

    if job.job_type == "batch_process":
        asyncio.run(_run_batch_in_background(job.id))
    elif job.job_type == "ocr_page":
        if job.page_id is not None:
            _run_page_ocr_in_thread(job.id, job.page_id)
        else:
            logger.warning("Job OCR %s sans page_id, ignoré.", job.id)
    elif job.job_type == "extract_pages":
        file_id = job.source_file_id
        if file_id is None:
            file_id = _legacy_extraction_file(job)
        if file_id is not None:
            _run_extraction_in_background(job.id, file_id)
        else:
            logger.warning("Job extraction %s sans fichier source, ignoré.", job.id)
    else:
        logger.warning("Type de job inconnu %r (job %s), ignoré.", job.job_type, job.id)


def _legacy_extraction_file(job: Job):
    """Retrouve le fichier non extrait d'un job créé avant source_file_id."""
    from app.models.page import Page
    from app.models.source_file import SourceFile

    with Session(engine) as session:
        candidates = session.exec(
            select(SourceFile).where(SourceFile.project_id == job.project_id)
        ).all()
        for candidate in candidates:
            extracted = session.exec(
                select(Page).where(Page.source_file_id == candidate.id)
            ).first()
            if extracted is None:
                return candidate.id
    return None


def _poll_once() -> None:
    with Session(engine) as session:
        pending = session.exec(
            select(Job).where(Job.status == "pending").order_by(Job.created_at)
        ).all()
        snapshot = [
            Job(
                id=j.id, project_id=j.project_id, user_id=j.user_id,
                page_id=j.page_id, source_file_id=j.source_file_id,
                job_type=j.job_type, status=j.status,
            )
            for j in pending
        ]
    for job in snapshot:
        if _stop_event.is_set():
            return
        try:
            _dispatch(job)
        except Exception:
            logger.exception("Échec du worker sur le job %s.", job.id)


def _run() -> None:
    while not _stop_event.is_set():
        try:
            _poll_once()
        except Exception:
            logger.exception("Erreur de la boucle worker jobs.")
        _stop_event.wait(_POLL_SECONDS)


def start_job_worker() -> None:
    """Démarre le worker DB (idempotent). Appelé par le lifespan."""
    global _thread
    with _lock:
        if _thread is not None and _thread.is_alive():
            return
        _stop_event.clear()
        _thread = threading.Thread(
            target=_run, name="taurge-job-worker", daemon=True
        )
        _thread.start()


def stop_job_worker() -> None:
    """Arrête le worker DB. Appelé à la fermeture du lifespan."""
    global _thread
    with _lock:
        _stop_event.set()
        thread, _thread = _thread, None
    if thread is not None:
        thread.join(timeout=5)
