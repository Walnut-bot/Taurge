"""Infra persistante : JWT court, rate-limit en base, reprise des jobs,
worker DB et migrations Alembic idempotentes."""
import os
import sqlite3
import subprocess
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlmodel import Session, select

import app.jobs.router as jobs_router
from app.core.config import settings
from app.core.db import engine
from app.core.security import create_access_token
from app.main import app
from app.models.job import Job
from app.models.login_attempt import LoginAttempt

API_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register(client, label):
    email = f"{label}-{uuid.uuid4().hex[:10]}@example.com"
    created = client.post("/auth/register", json={
        "email": email, "password": "password123",
        "accepted_terms": True, "age_confirmed": True, "newsletter_opt_in": False,
    })
    assert created.status_code == 201, created.text
    return email


def test_jwt_default_lifetime_at_most_24h():
    assert settings.access_token_expire_minutes <= 24 * 60
    token = create_access_token(subject="user-1")
    payload = jwt.decode(
        token, settings.secret_key, algorithms=[settings.algorithm]
    )
    remaining = payload["exp"] - datetime.now(timezone.utc).timestamp()
    assert 0 < remaining <= 24 * 3600 + 60


def test_login_attempts_are_persisted_and_cleared_on_success(client):
    email = _register(client, "attempts")
    failed = client.post(
        "/auth/login", json={"email": email, "password": "wrong-password"}
    )
    assert failed.status_code == 401, failed.text
    with Session(engine) as session:
        rows = session.exec(
            select(LoginAttempt).where(LoginAttempt.email == email)
        ).all()
    assert len(rows) == 1

    ok = client.post(
        "/auth/login", json={"email": email, "password": "password123"}
    )
    assert ok.status_code == 200, ok.text
    with Session(engine) as session:
        rows = session.exec(
            select(LoginAttempt).where(LoginAttempt.email == email)
        ).all()
    assert rows == []


def test_login_attempts_outside_window_do_not_block(client):
    email = _register(client, "window")
    with Session(engine) as session:
        for _ in range(settings.login_max_failed_attempts + 2):
            session.add(LoginAttempt(
                email=email,
                attempted_at=datetime.now(timezone.utc)
                - timedelta(minutes=settings.login_block_window_minutes + 5),
            ))
        session.commit()
    ok = client.post(
        "/auth/login", json={"email": email, "password": "password123"}
    )
    assert ok.status_code == 200, ok.text


def test_recover_interrupted_jobs_requeues_running():
    job_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(Job(
            id=job_id, project_id=uuid.uuid4(), user_id=uuid.uuid4(),
            job_type="unknown_test_type", status="running",
        ))
        session.commit()
    try:
        assert jobs_router.recover_interrupted_jobs() >= 1
        with Session(engine) as session:
            job = session.get(Job, job_id)
            assert job.status == "pending"
            assert job.completed_at is None
    finally:
        with Session(engine) as session:
            job = session.get(Job, job_id)
            if job:
                session.delete(job)
                session.commit()


def test_claim_job_only_once():
    job_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(Job(
            id=job_id, project_id=uuid.uuid4(), user_id=uuid.uuid4(),
            job_type="unknown_test_type", status="pending",
        ))
        session.commit()
    try:
        with Session(engine) as session:
            assert jobs_router._claim_job(session, job_id) is True
        with Session(engine) as session:
            assert jobs_router._claim_job(session, job_id) is False
    finally:
        with Session(engine) as session:
            job = session.get(Job, job_id)
            if job:
                session.delete(job)
                session.commit()


def test_worker_executes_pending_ocr_job(client, monkeypatch):
    import io

    from PIL import Image

    from app.ocr.provider import OCRBlockData

    class _FakeOCR:
        async def detect_text(self, image_bytes, source_lang):
            return [OCRBlockData(
                text="HELLO", bbox_x=1, bbox_y=2, bbox_w=30, bbox_h=10,
                confidence=0.9, provider="fake",
            )]

    monkeypatch.setattr(jobs_router, "get_ocr_provider", lambda: _FakeOCR())
    email = _register(client, "worker")
    token = client.post(
        "/auth/login", json={"email": email, "password": "password123"}
    )
    headers = {"Authorization": f"Bearer {token.json()['access_token']}"}
    project = client.post("/projects", headers=headers, json={
        "name": "Worker", "source_lang": "en", "target_lang": "fr",
        "content_type": "manga",
    })
    project_id = project.json()["id"]
    buffer = io.BytesIO()
    Image.new("RGB", (200, 260), color="white").save(buffer, format="PNG")
    upload = client.post(
        f"/projects/{project_id}/upload", headers=headers,
        files={"file": ("page.png", buffer.getvalue(), "image/png")},
    )
    extracted = client.post(
        f"/projects/{project_id}/files/{upload.json()['id']}/extract",
        headers=headers,
    )
    page_id = extracted.json()[0]["id"]

    # Job créé directement en base : aucun BackgroundTasks ne le lance,
    # seul le worker DB démarré par le lifespan peut l'exécuter.
    me = client.get("/auth/me", headers=headers).json()
    with Session(engine) as session:
        job = Job(
            project_id=uuid.UUID(project_id), user_id=uuid.UUID(me["id"]),
            page_id=uuid.UUID(page_id), job_type="ocr_page",
            status="pending", total_pages=1,
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        job_id = job.id

    deadline = time.monotonic() + 15
    status = None
    while time.monotonic() < deadline:
        status = client.get(f"/jobs/{job_id}", headers=headers).json()["status"]
        if status in ("completed", "failed", "cancelled"):
            break
        time.sleep(0.2)
    assert status == "completed"


def test_alembic_upgrade_adds_missing_columns(tmp_path):
    pytest.importorskip("alembic")
    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE users (id CHAR(32) PRIMARY KEY, email VARCHAR,
                            password_hash VARCHAR, created_at TIMESTAMP);
        CREATE TABLE pages (id CHAR(32) PRIMARY KEY, project_id CHAR(32),
                            source_file_id CHAR(32), page_number INTEGER,
                            storage_key VARCHAR, created_at TIMESTAMP);
        CREATE TABLE jobs (id CHAR(32) PRIMARY KEY, project_id CHAR(32),
                           user_id CHAR(32), job_type VARCHAR,
                           status VARCHAR, current_page INTEGER,
                           total_pages INTEGER, progress_percent INTEGER,
                           message VARCHAR, error_message VARCHAR,
                           created_at TIMESTAMP, updated_at TIMESTAMP,
                           completed_at TIMESTAMP);
        """
    )
    conn.commit()
    conn.close()
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite:///{db_path.as_posix()}",
        "ENVIRONMENT": "development",
        "SECRET_KEY": "test-secret-key",
    }
    stamp = subprocess.run(
        [sys.executable, "-m", "alembic", "stamp", "7f2c9a1b4d03"],
        cwd=API_DIR, env=env, capture_output=True, text=True, timeout=120,
    )
    assert stamp.returncode == 0, stamp.stderr
    upgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_DIR, env=env, capture_output=True, text=True, timeout=120,
    )
    assert upgrade.returncode == 0, upgrade.stderr
    # Idempotence : un second upgrade ne casse rien.
    again = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_DIR, env=env, capture_output=True, text=True, timeout=120,
    )
    assert again.returncode == 0, again.stderr

    conn = sqlite3.connect(db_path)
    users = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    jobs = {row[1] for row in conn.execute("PRAGMA table_info(jobs)")}
    tables = {row[0] for row in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    conn.close()
    assert {"terms_accepted_at", "age_confirmed_at", "newsletter_opt_in"} <= users
    assert {"page_id", "source_file_id"} <= jobs
    assert "login_attempts" in tables


def test_alembic_upgrade_repairs_partially_applied_schema(tmp_path):
    """Base réelle tamponnée `head` sans les colonnes des migrations
    intermédiaires (create_all crée les tables, pas les colonnes, puis
    l'ancien tamponnage sautait les migrations) : reculer le tampon puis
    `upgrade head` doit ajouter les colonnes manquantes sans échouer
    sur celles déjà présentes (users avait déjà ses colonnes profil)."""
    pytest.importorskip("alembic")
    db_path = tmp_path / "partial.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE users (id CHAR(32) PRIMARY KEY, email VARCHAR,
                            password_hash VARCHAR, created_at TIMESTAMP,
                            display_name VARCHAR,
                            avatar_content_type VARCHAR,
                            banner_content_type VARCHAR,
                            default_content_type VARCHAR,
                            default_source_lang VARCHAR,
                            default_target_lang VARCHAR);
        CREATE TABLE pages (id CHAR(32) PRIMARY KEY, project_id CHAR(32),
                            source_file_id CHAR(32), page_number INTEGER,
                            storage_key VARCHAR, created_at TIMESTAMP);
        CREATE TABLE ocr_blocks (id CHAR(32) PRIMARY KEY, page_id CHAR(32),
                                 text VARCHAR, created_at TIMESTAMP);
        CREATE TABLE jobs (id CHAR(32) PRIMARY KEY, project_id CHAR(32),
                           user_id CHAR(32), job_type VARCHAR,
                           status VARCHAR, current_page INTEGER,
                           total_pages INTEGER, progress_percent INTEGER,
                           message VARCHAR, error_message VARCHAR,
                           created_at TIMESTAMP, updated_at TIMESTAMP,
                           completed_at TIMESTAMP);
        """
    )
    conn.commit()
    conn.close()
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite:///{db_path.as_posix()}",
        "ENVIRONMENT": "development",
        "SECRET_KEY": "test-secret-key",
    }
    stamp = subprocess.run(
        [sys.executable, "-m", "alembic", "stamp", "21e39722a65a"],
        cwd=API_DIR, env=env, capture_output=True, text=True, timeout=120,
    )
    assert stamp.returncode == 0, stamp.stderr
    upgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_DIR, env=env, capture_output=True, text=True, timeout=120,
    )
    assert upgrade.returncode == 0, upgrade.stderr
    again = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_DIR, env=env, capture_output=True, text=True, timeout=120,
    )
    assert again.returncode == 0, again.stderr

    conn = sqlite3.connect(db_path)
    jobs = {row[1] for row in conn.execute("PRAGMA table_info(jobs)")}
    ocr_blocks = {row[1] for row in conn.execute("PRAGMA table_info(ocr_blocks)")}
    pages = {row[1] for row in conn.execute("PRAGMA table_info(pages)")}
    conn.close()
    assert "source_file_id" in jobs
    assert {"manhwa_style", "rotation_angle", "font_size_scale",
            "text_color", "stroke_color", "stroke_width"} <= ocr_blocks
    assert "workflow_status" in pages
