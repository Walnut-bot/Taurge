"""Régressions : suppression de projet, extraction, jobs orphelins.

1. Suppression : l'endpoint se contentait de `session.delete(project)`.
   Sur PostgreSQL (Render), les lignes enfants (pages, blocs, membres…)
   violent les clés étrangères -> 500, et côté web la modale restait
   ouverte sans message. Sur SQLite le delete passait mais laissait des
   orphelins partout. Le contrat testé ici : tout disparaît, base et
   fichiers.
2. Un crash mémoire (OOM Render 512 Mo) tue le processus en pleine
   extraction : le job reste « running » en base pour toujours et le
   frontend boucle sur « Connection lost while tracking. Retrying… ».
   Au démarrage, les jobs orphelins doivent être marqués échoués.
3. L'extraction PDF/image doit fonctionner de bout en bout via l'API
   (job d'arrière-plan et endpoint synchrone), page par page.
"""
import io
import uuid

import fitz
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session, select

from app.core.db import engine
from app.main import app
from app.models.cleaned_page import CleanedPage
from app.models.export import Export
from app.models.glossary import GlossaryEntry
from app.models.job import Job
from app.models.ocr_block import OCRBlock
from app.models.page import Page
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.subscription import ProjectMember
from app.models.translation import Translation
from app.storage.dependencies import storage_provider


def _register_and_login(client: TestClient, label: str) -> dict:
    email = f"{label}-{uuid.uuid4().hex[:10]}@example.com"
    password = "password123"
    created = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "accepted_terms": True,
            "age_confirmed": True,
            "newsletter_opt_in": False,
        },
    )
    assert created.status_code == 201, created.text
    token = client.post("/auth/login", json={"email": email, "password": password})
    assert token.status_code == 200, token.text
    headers = {"Authorization": f"Bearer {token.json()['access_token']}"}
    me = client.get("/auth/me", headers=headers)
    return {"id": me.json()["id"], "email": email, "headers": headers}


def _create_project(client: TestClient, headers: dict) -> str:
    resp = client.post(
        "/projects",
        headers=headers,
        json={
            "name": "À supprimer",
            "source_lang": "ja",
            "target_lang": "fr",
            "content_type": "manga",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _png_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (12, 16), color=(10, 120, 200)).save(buffer, format="PNG")
    return buffer.getvalue()


def _pdf_bytes(pages: int = 3) -> bytes:
    doc = fitz.open()
    for index in range(pages):
        page = doc.new_page(width=300, height=420)
        page.insert_text((40, 60), f"Page {index + 1}")
    data = doc.tobytes()
    doc.close()
    return data


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_owner_delete_project_removes_everything(client):
    owner = _register_and_login(client, "del-owner")
    member = _register_and_login(client, "del-member")
    project_id = uuid.UUID(_create_project(client, owner["headers"]))

    invite = client.post(
        f"/projects/{project_id}/members",
        headers=owner["headers"],
        json={"email": member["email"], "role": "translator"},
    )
    assert invite.status_code == 201, invite.text

    page_key = f"pages/{project_id}/page.png"
    cleaned_key = f"pages/{project_id}/page-cleaned.png"
    source_key = f"originals/{project_id}/source.png"
    export_key = f"exports/{project_id}/export.zip"
    for key in (page_key, cleaned_key, source_key, export_key):
        storage_provider.save(key, b"contenu")

    with Session(engine) as session:
        source = SourceFile(
            project_id=project_id, storage_key=source_key,
            original_filename="source.png", file_type="png", size_bytes=8,
        )
        session.add(source)
        session.commit()
        session.refresh(source)
        page = Page(
            project_id=project_id, source_file_id=source.id, page_number=1,
            storage_key=page_key, width=12, height=16,
        )
        session.add(page)
        session.commit()
        session.refresh(page)
        block = OCRBlock(
            page_id=page.id, text="texte", bbox_x=0, bbox_y=0,
            bbox_w=5, bbox_h=5, confidence=0.9, provider="test",
        )
        session.add(block)
        session.commit()
        session.refresh(block)
        session.add(Translation(ocr_block_id=block.id, translated_text="texte", provider="test"))
        session.add(CleanedPage(page_id=page.id, storage_key=cleaned_key))
        session.add(Export(project_id=project_id, format="zip", storage_key=export_key))
        session.add(Job(project_id=project_id, user_id=uuid.UUID(owner["id"])))
        session.add(GlossaryEntry(
            project_id=project_id, category="term",
            source_term="先生", target_term="Sensei",
        ))
        session.commit()
        page_id = page.id
        block_id = block.id

    # Un membre ne peut toujours pas supprimer le projet d'autrui.
    forbidden = client.delete(f"/projects/{project_id}", headers=member["headers"])
    assert forbidden.status_code == 403, forbidden.text

    deleted = client.delete(f"/projects/{project_id}", headers=owner["headers"])
    assert deleted.status_code == 204, deleted.text

    assert client.get(f"/projects/{project_id}", headers=owner["headers"]).status_code == 404

    with Session(engine) as session:
        assert session.get(Project, project_id) is None
        assert session.exec(select(Page).where(Page.project_id == project_id)).all() == []
        assert session.exec(select(SourceFile).where(SourceFile.project_id == project_id)).all() == []
        assert session.exec(select(Export).where(Export.project_id == project_id)).all() == []
        assert session.exec(select(Job).where(Job.project_id == project_id)).all() == []
        assert session.exec(select(GlossaryEntry).where(GlossaryEntry.project_id == project_id)).all() == []
        assert session.exec(select(ProjectMember).where(ProjectMember.project_id == project_id)).all() == []
        assert session.exec(select(OCRBlock).where(OCRBlock.page_id == page_id)).all() == []
        assert session.exec(select(CleanedPage).where(CleanedPage.page_id == page_id)).all() == []
        assert session.exec(select(Translation).where(Translation.ocr_block_id == block_id)).all() == []

    for key in (page_key, cleaned_key, source_key, export_key):
        assert not storage_provider.exists(key), f"fichier non supprimé : {key}"


def test_orphaned_jobs_are_failed_by_recovery(client):
    from app.jobs.router import fail_orphaned_jobs

    owner = _register_and_login(client, "job-owner")
    project_id = uuid.UUID(_create_project(client, owner["headers"]))
    with Session(engine) as session:
        running = Job(
            project_id=project_id, user_id=uuid.UUID(owner["id"]),
            job_type="extract_pages", status="running",
        )
        done = Job(
            project_id=project_id, user_id=uuid.UUID(owner["id"]),
            job_type="extract_pages", status="completed",
        )
        session.add(running)
        session.add(done)
        session.commit()
        session.refresh(running)
        session.refresh(done)
        running_id, done_id = running.id, done.id

    assert fail_orphaned_jobs() >= 1

    with Session(engine) as session:
        assert session.get(Job, running_id).status == "failed"
        assert session.get(Job, done_id).status == "completed"


def test_extract_pdf_via_job_and_sync_endpoints(client):
    owner = _register_and_login(client, "extract-owner")
    project_id = _create_project(client, owner["headers"])

    # Job d'arrière-plan (chemin utilisé par l'interface web)
    upload = client.post(
        f"/projects/{project_id}/upload",
        headers=owner["headers"],
        files={"file": ("chapitre.pdf", _pdf_bytes(3), "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    started = client.post(
        f"/jobs/projects/{project_id}/files/{upload.json()['id']}/start-extraction",
        headers=owner["headers"],
    )
    assert started.status_code == 202, started.text
    job = client.get(f"/jobs/{started.json()['job_id']}", headers=owner["headers"])
    assert job.status_code == 200, job.text
    assert job.json()["status"] == "completed", job.json()

    detail = client.get(f"/projects/{project_id}", headers=owner["headers"])
    pages = detail.json()["pages"]
    assert len(pages) == 3
    image = client.get(f"/pages/{pages[0]['id']}/image", headers=owner["headers"])
    assert image.status_code == 200
    assert image.content[:8] == b"\x89PNG\r\n\x1a\n"

    # Endpoint synchrone : même résultat, page par page
    upload2 = client.post(
        f"/projects/{project_id}/upload",
        headers=owner["headers"],
        files={"file": ("chapitre2.pdf", _pdf_bytes(2), "application/pdf")},
    )
    assert upload2.status_code == 201, upload2.text
    extracted = client.post(
        f"/projects/{project_id}/files/{upload2.json()['id']}/extract",
        headers=owner["headers"],
    )
    assert extracted.status_code == 201, extracted.text
    assert len(extracted.json()) == 2
