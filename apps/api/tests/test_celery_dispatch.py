"""Celery + Redis : configuration, aiguillage et repli worker DB.

Aucun vrai serveur Redis n'est requis : le broker est simulé par le
mode eager de Celery (tâche exécutée dans le processus, via le vrai
registre de tâches) et le ping broker est doublé. Le repli (broker
muet ou Celery désactivé) doit rendre la main au worker DB intégré.
"""
import uuid

import fitz
import pytest
from sqlmodel import Session, select

import app.jobs.dispatch as dispatch
import app.jobs.tasks  # noqa: F401 — enregistre les tâches dans l'app
from app.core.config import settings
from app.core.db import engine, init_db
from app.jobs.celery_app import get_celery_app
from app.models.job import Job
from app.models.page import Page
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.user import User
from app.storage.dependencies import storage_provider


@pytest.fixture()
def eager_celery(monkeypatch):
    celery = get_celery_app()
    monkeypatch.setattr(celery.conf, "task_always_eager", True)
    monkeypatch.setattr(celery.conf, "task_eager_propagates", True)
    # Aucun serveur Redis dans les tests : résultats en mémoire.
    monkeypatch.setattr(celery.conf, "result_backend", "cache+memory://")
    monkeypatch.setattr(dispatch, "broker_reachable", lambda: True)
    monkeypatch.setattr(dispatch, "worker_alive", lambda: True)
    return celery


def test_celery_app_uses_configured_redis_broker():
    celery = get_celery_app()
    assert celery.conf.broker_url == settings.celery_broker_url
    assert celery.conf.result_backend == settings.celery_result_backend
    for name in ("taurge.extract_pages", "taurge.batch_process", "taurge.ocr_page"):
        assert name in celery.tasks


def test_dispatch_falls_back_when_broker_is_silent(monkeypatch):
    monkeypatch.setattr(dispatch, "broker_reachable", lambda: False)
    monkeypatch.setattr(settings, "use_celery", "auto")
    assert dispatch.dispatch_job_via_celery("batch_process", uuid.uuid4()) is False


def test_dispatch_falls_back_when_no_worker_consumes(monkeypatch):
    # Redis répond mais aucun worker Celery : enfiler laisserait le
    # job pending pour toujours, le repli local doit prendre la main.
    monkeypatch.setattr(dispatch, "broker_reachable", lambda: True)
    monkeypatch.setattr(dispatch, "worker_alive", lambda: False)
    monkeypatch.setattr(settings, "use_celery", "auto")
    assert dispatch.dispatch_job_via_celery("batch_process", uuid.uuid4()) is False


def test_dispatch_disabled_by_setting(monkeypatch):
    monkeypatch.setattr(settings, "use_celery", "false")
    assert dispatch.celery_enabled() is False
    assert dispatch.dispatch_job_via_celery("batch_process", uuid.uuid4()) is False


def _pdf_bytes(pages: int = 2) -> bytes:
    doc = fitz.open()
    for index in range(pages):
        page = doc.new_page(width=300, height=420)
        page.insert_text((40, 60), f"Page {index + 1}")
    data = doc.tobytes()
    doc.close()
    return data


def test_extraction_job_runs_through_celery(eager_celery):
    init_db()
    project_id, source_id, job_id, user_id = (uuid.uuid4() for _ in range(4))
    source_key = f"originals/{project_id}/celery.pdf"
    storage_provider.save(source_key, _pdf_bytes(2))
    with Session(engine) as session:
        session.add(User(id=user_id, email=f"celery-{uuid.uuid4().hex[:8]}@example.com",
                         password_hash="x"))
        session.add(Project(id=project_id, owner_id=user_id, name="Celery",
                            source_lang="ja", target_lang="fr", content_type="manga"))
        session.add(SourceFile(id=source_id, project_id=project_id,
                               storage_key=source_key, original_filename="celery.pdf",
                               file_type="pdf", size_bytes=10))
        session.add(Job(id=job_id, project_id=project_id, user_id=user_id,
                        source_file_id=source_id, job_type="extract_pages",
                        status="pending"))
        session.commit()

    sent = dispatch.dispatch_job_via_celery(
        "extract_pages", job_id, source_file_id=source_id
    )
    assert sent is True

    with Session(engine) as session:
        job = session.get(Job, job_id)
        assert job is not None and job.status == "completed", (
            job.status if job else None, job.error_message if job else None)
        pages = session.exec(
            select(Page).where(Page.source_file_id == source_id)
        ).all()
        assert len(pages) == 2
