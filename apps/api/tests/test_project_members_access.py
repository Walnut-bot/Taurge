"""Régression : un membre invité doit pouvoir travailler sur le projet.

Scénario vécu : A crée un projet et invite B et C. B et C voient le
projet dans leur liste, mais l'atelier affiche « Image unavailable for
this page » : seuls les endpoints projet/pièces jointes acceptaient les
membres, tandis que les images de pages (et les blocs, traductions,
glossaire, exports…) exigeaient le propriétaire et répondaient 404.

Ces tests verrouillent : membre = accès de travail complet, extérieur
= toujours 404, suppression du projet = propriétaire uniquement.
"""
import io
import uuid

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session

from app.core.db import engine
from app.main import app
from app.models.cleaned_page import CleanedPage
from app.models.export import Export
from app.models.job import Job
from app.models.ocr_block import OCRBlock
from app.models.page import Page
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.translation import Translation
from app.storage.dependencies import storage_provider

PAGE_PNG_KEY = "pages/page-test.png"
CLEANED_PNG_KEY = "pages/page-test-cleaned.png"
EXPORT_KEY = "exports/export-test.zip"


def _png_bytes(color: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (12, 16), color=color).save(buffer, format="PNG")
    return buffer.getvalue()


PAGE_PNG = _png_bytes((200, 30, 30))
CLEANED_PNG = _png_bytes((30, 30, 200))


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
    assert me.status_code == 200, me.text
    return {"id": me.json()["id"], "email": email, "headers": headers}


@pytest.fixture(scope="module")
def scenario():
    with TestClient(app) as client:
        owner = _register_and_login(client, "owner-a")
        member_b = _register_and_login(client, "member-b")
        member_c = _register_and_login(client, "member-c")
        outsider = _register_and_login(client, "outsider-d")

        project_resp = client.post(
            "/projects",
            headers=owner["headers"],
            json={
                "name": "Chapitre équipe",
                "source_lang": "ja",
                "target_lang": "fr",
                "content_type": "manga",
            },
        )
        assert project_resp.status_code == 201, project_resp.text
        project_id = uuid.UUID(project_resp.json()["id"])

        for member, role in ((member_b, "translator"), (member_c, "cleaner")):
            invite = client.post(
                f"/projects/{project_id}/members",
                headers=owner["headers"],
                json={"email": member["email"], "role": role},
            )
            assert invite.status_code == 201, invite.text

        # Page + bloc + traduction + version nettoyée + export, créés
        # directement en base (le pipeline OCR n'est pas l'objet du test).
        storage_provider.save(PAGE_PNG_KEY, PAGE_PNG)
        storage_provider.save(CLEANED_PNG_KEY, CLEANED_PNG)
        storage_provider.save(EXPORT_KEY, b"fake-zip")
        with Session(engine) as session:
            source = SourceFile(
                project_id=project_id,
                storage_key="originals/source.png",
                original_filename="source.png",
                file_type="png",
                size_bytes=len(PAGE_PNG),
            )
            session.add(source)
            session.commit()
            session.refresh(source)
            page = Page(
                project_id=project_id,
                source_file_id=source.id,
                page_number=1,
                storage_key=PAGE_PNG_KEY,
                width=12,
                height=16,
            )
            session.add(page)
            session.commit()
            session.refresh(page)
            session.add(CleanedPage(page_id=page.id, storage_key=CLEANED_PNG_KEY))
            block = OCRBlock(
                page_id=page.id,
                text="こんにちは",
                bbox_x=0,
                bbox_y=0,
                bbox_w=10,
                bbox_h=10,
                confidence=0.9,
                provider="test",
            )
            session.add(block)
            session.commit()
            session.refresh(block)
            translation = Translation(
                ocr_block_id=block.id, translated_text="Bonjour", provider="test"
            )
            block_to_delete = OCRBlock(
                page_id=page.id,
                text="à supprimer",
                bbox_x=1,
                bbox_y=1,
                bbox_w=5,
                bbox_h=5,
                confidence=0.5,
                provider="test",
            )
            export = Export(
                project_id=project_id, format="zip", storage_key=EXPORT_KEY
            )
            job = Job(
                project_id=project_id,
                user_id=uuid.UUID(owner["id"]),
                job_type="batch_process",
                status="completed",
            )
            session.add(translation)
            session.add(block_to_delete)
            session.add(export)
            session.add(job)
            session.commit()
            session.refresh(translation)
            session.refresh(block_to_delete)
            session.refresh(export)
            session.refresh(job)
            ids = {
                "project_id": str(project_id),
                "page_id": str(page.id),
                "block_id": str(block.id),
                "block_to_delete_id": str(block_to_delete.id),
                "translation_id": str(translation.id),
                "export_id": str(export.id),
                "job_id": str(job.id),
            }
        yield {
            "client": client,
            "owner": owner,
            "member_b": member_b,
            "member_c": member_c,
            "outsider": outsider,
            **ids,
        }


def test_member_sees_project_and_page_images(scenario):
    client, b, c = scenario["client"], scenario["member_b"], scenario["member_c"]
    a = scenario["owner"]
    for user in (a, b, c):
        detail = client.get(f"/projects/{scenario['project_id']}", headers=user["headers"])
        assert detail.status_code == 200, detail.text
        image = client.get(f"/pages/{scenario['page_id']}/image", headers=user["headers"])
        assert image.status_code == 200, image.text
        assert image.content == PAGE_PNG
        cleaned = client.get(
            f"/pages/{scenario['page_id']}/cleaned-image", headers=user["headers"]
        )
        assert cleaned.status_code == 200, cleaned.text
        assert cleaned.content == CLEANED_PNG


def test_member_can_edit_blocks_and_translation(scenario):
    client, b = scenario["client"], scenario["member_b"]
    updated = client.patch(
        f"/ocr-blocks/{scenario['block_id']}",
        headers=b["headers"],
        json={"text": "こんにちは、世界"},
    )
    assert updated.status_code == 200, updated.text
    translated = client.patch(
        f"/translations/{scenario['translation_id']}",
        headers=b["headers"],
        json={"translated_text": "Bonjour le monde"},
    )
    assert translated.status_code == 200, translated.text
    deleted = client.delete(
        f"/ocr-blocks/{scenario['block_to_delete_id']}", headers=b["headers"]
    )
    assert deleted.status_code == 204, deleted.text


def test_member_can_use_glossary_export_and_job(scenario):
    client, b = scenario["client"], scenario["member_b"]
    entries = client.get(
        f"/projects/{scenario['project_id']}/glossary", headers=b["headers"]
    )
    assert entries.status_code == 200, entries.text
    created = client.post(
        f"/projects/{scenario['project_id']}/glossary",
        headers=b["headers"],
        json={"category": "term", "source_term": "先生", "target_term": "Sensei"},
    )
    assert created.status_code == 201, created.text
    download = client.get(
        f"/exports/{scenario['export_id']}/download", headers=b["headers"]
    )
    assert download.status_code == 200, download.text
    assert download.content == b"fake-zip"
    job = client.get(f"/jobs/{scenario['job_id']}", headers=b["headers"])
    assert job.status_code == 200, job.text


def test_outsider_still_gets_404_everywhere(scenario):
    client, d = scenario["client"], scenario["outsider"]
    assert client.get(
        f"/projects/{scenario['project_id']}", headers=d["headers"]
    ).status_code == 404
    assert client.get(
        f"/pages/{scenario['page_id']}/image", headers=d["headers"]
    ).status_code == 404
    assert client.get(
        f"/pages/{scenario['page_id']}/cleaned-image", headers=d["headers"]
    ).status_code == 404
    assert client.patch(
        f"/translations/{scenario['translation_id']}",
        headers=d["headers"],
        json={"translated_text": "pirate"},
    ).status_code == 404


def test_member_cannot_delete_project(scenario):
    client, b, a = scenario["client"], scenario["member_b"], scenario["owner"]
    deleted = client.delete(
        f"/projects/{scenario['project_id']}", headers=b["headers"]
    )
    assert deleted.status_code == 403, deleted.text
    still_there = client.get(
        f"/projects/{scenario['project_id']}", headers=a["headers"]
    )
    assert still_there.status_code == 200, still_there.text
