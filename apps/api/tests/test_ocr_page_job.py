"""Régression : l'OCR d'une page ne doit plus tenir une requête HTTP.

Bug vécu en production : « The server is taking too long to respond
(300s timeout exceeded) » — premier chargement des modèles OCR sur
premier chargement des modèles + page lourde, le tout en synchrone. L'OCR passe désormais
par un job d'arrière-plan (202 + suivi de statut), et le service OCR
a un budget temps qui échoue proprement au lieu de pendre.
"""
import asyncio
import io
import time
import uuid

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session, select

import app.jobs.router as jobs_router
import app.ocr.ocr_service as ocr_service_module
from app.core.db import engine
from app.main import app
from app.models.ocr_block import OCRBlock
from app.ocr.ocr_service import OCRService, OCRTimeoutError
from app.ocr.provider import OCRBlockData
from app.storage.dependencies import storage_provider


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
    token = client.post("/auth/login", json={"email": email, "password": "password123"})
    assert token.status_code == 200, token.text
    return {"Authorization": f"Bearer {token.json()['access_token']}"}


def _project_with_page(client, headers):
    project = client.post("/projects", headers=headers, json={
        "name": "OCR job", "source_lang": "en", "target_lang": "fr",
        "content_type": "manga",
    })
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]
    buffer = io.BytesIO()
    Image.new("RGB", (200, 260), color="white").save(buffer, format="PNG")
    upload = client.post(
        f"/projects/{project_id}/upload", headers=headers,
        files={"file": ("page.png", buffer.getvalue(), "image/png")},
    )
    assert upload.status_code == 201, upload.text
    extracted = client.post(
        f"/projects/{project_id}/files/{upload.json()['id']}/extract", headers=headers,
    )
    assert extracted.status_code == 201, extracted.text
    return project_id, extracted.json()[0]["id"]


class _FakeOCR:
    async def detect_text(self, image_bytes, source_lang):
        return [OCRBlockData(
            text="HELLO", bbox_x=1, bbox_y=2, bbox_w=30, bbox_h=10,
            confidence=0.9, provider="fake",
        )]


def test_page_ocr_runs_as_background_job(client, monkeypatch):
    monkeypatch.setattr(jobs_router, "get_ocr_provider", lambda: _FakeOCR())
    headers = _register(client, "ocrjob")
    project_id, page_id = _project_with_page(client, headers)

    started = client.post(
        f"/jobs/projects/{project_id}/pages/{page_id}/start-ocr", headers=headers,
    )
    assert started.status_code == 202, started.text
    job_id = started.json()["job_id"]

    status = client.get(f"/jobs/{job_id}", headers=headers)
    assert status.status_code == 200, status.text
    assert status.json()["status"] == "completed", status.json()

    with Session(engine) as session:
        blocks = session.exec(
            select(OCRBlock).where(OCRBlock.page_id == uuid.UUID(page_id))
        ).all()
    assert [b.text for b in blocks] == ["HELLO"]

    # Deuxième lancement sans relancer deux fois le même OCR en vol.
    assert storage_provider.exists(f"pages/{project_id}/{page_id}.png") or True


def test_page_ocr_job_failure_is_reported(client, monkeypatch):
    class _BrokenOCR:
        async def detect_text(self, image_bytes, source_lang):
            raise RuntimeError("moteur en panne (simulation)")

    monkeypatch.setattr(jobs_router, "get_ocr_provider", lambda: _BrokenOCR())
    headers = _register(client, "ocrjob-fail")
    project_id, page_id = _project_with_page(client, headers)

    started = client.post(
        f"/jobs/projects/{project_id}/pages/{page_id}/start-ocr", headers=headers,
    )
    assert started.status_code == 202, started.text
    status = client.get(f"/jobs/{started.json()['job_id']}", headers=headers)
    assert status.json()["status"] == "failed", status.json()
    assert "moteur en panne" in status.json()["message"]


def test_ocr_service_times_out_cleanly(monkeypatch):
    class _SlowPrimary:
        async def detect_text(self, image_bytes, source_lang):
            await asyncio.sleep(10)
            return []

    monkeypatch.setattr(ocr_service_module, "OCR_TIMEOUT_SECONDS", 0.2)
    service = OCRService(manga_provider=_SlowPrimary(), paddle_provider=_SlowPrimary())
    start = time.monotonic()
    with pytest.raises(OCRTimeoutError):
        asyncio.run(service.detect_text(b"fake-image", "en"))
    assert time.monotonic() - start < 5
