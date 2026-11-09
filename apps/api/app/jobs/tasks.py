"""Tâches Celery : extraction, batch (OCR+traduction+clean), OCR page.

Chaque tâche délègue à app.jobs.execution (même code que le worker DB
et les BackgroundTasks) : le claim atomique `pending -> running` en
base garantit qu'un job n'est exécuté qu'une fois, quel que soit le
canal qui le déclenche.
"""
import asyncio
import logging
import uuid

from app.jobs.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="taurge.extract_pages", bind=True)
def extract_pages_task(self, job_id: str, file_id: str) -> str:
    from app.jobs.execution import _run_extraction_in_background

    _run_extraction_in_background(uuid.UUID(job_id), uuid.UUID(file_id))
    return job_id


@celery_app.task(name="taurge.batch_process", bind=True)
def batch_process_task(self, job_id: str) -> str:
    from app.jobs.execution import _run_batch_in_background

    asyncio.run(_run_batch_in_background(uuid.UUID(job_id)))
    return job_id


@celery_app.task(name="taurge.ocr_page", bind=True)
def ocr_page_task(self, job_id: str, page_id: str) -> str:
    from app.jobs.execution import _run_page_ocr_in_thread

    _run_page_ocr_in_thread(uuid.UUID(job_id), uuid.UUID(page_id))
    return job_id
