"""Tests d'intégration pour :
1. Commentaires collaboratifs par page / bulle (Section 18)
2. Versioning de page : snapshots et restauration non-destructive (Section 19)
3. Panneau d'administration `/admin` : contrôle RBAC (403 non-admin), statistiques,
   attribution de crédits auditée dans UsageLedger (Section 34)
"""

import io
import uuid

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session, select

from app.core.db import engine
from app.main import app
from app.models.ocr_block import OCRBlock
from app.models.subscription import UsageLedger
from app.models.translation import Translation
from app.models.user import User


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


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


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 80), color=(30, 60, 90)).save(buf, format="PNG")
    return buf.getvalue()


def test_page_comments_and_version_snapshots_restore(client: TestClient):
    owner = _register_and_login(client, "collab-owner")
    outsider = _register_and_login(client, "collab-outsider")

    proj_resp = client.post(
        "/projects",
        headers=owner["headers"],
        json={
            "name": "Projet Versioning & Notes",
            "source_lang": "ja",
            "target_lang": "fr",
            "content_type": "manga",
        },
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    upload = client.post(
        f"/projects/{project_id}/upload",
        headers=owner["headers"],
        files={"file": ("page1.png", _png_bytes(), "image/png")},
    )
    assert upload.status_code == 201
    extracted = client.post(
        f"/projects/{project_id}/files/{upload.json()['id']}/extract",
        headers=owner["headers"],
    )
    assert extracted.status_code == 201
    page_id = extracted.json()[0]["id"]

    # 1. Commentaires : création, résolution, isolation multi-tenant
    forbidden = client.get(
        f"/projects/{project_id}/pages/{page_id}/comments",
        headers=outsider["headers"],
    )
    assert forbidden.status_code == 404

    created_comment = client.post(
        f"/projects/{project_id}/pages/{page_id}/comments",
        headers=owner["headers"],
        json={"content": "Vérifier le tutoiement sur cette planche."},
    )
    assert created_comment.status_code == 201, created_comment.text
    comment_id = created_comment.json()["id"]
    assert created_comment.json()["is_resolved"] is False

    resolved = client.patch(
        f"/projects/{project_id}/comments/{comment_id}",
        headers=owner["headers"],
        json={"is_resolved": True},
    )
    assert resolved.status_code == 200
    assert resolved.json()["is_resolved"] is True

    listed = client.get(
        f"/projects/{project_id}/pages/{page_id}/comments",
        headers=owner["headers"],
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    # 2. Versioning : création d'un bloc OCR + traduction, sauvegarde v1, suppression, restauration
    with Session(engine) as session:
        blk = OCRBlock(
            page_id=uuid.UUID(page_id),
            text="行くぞ！",
            bbox_x=10,
            bbox_y=15,
            bbox_w=40,
            bbox_h=25,
            confidence=0.98,
            provider="manga-ocr",
            manhwa_style="scream",
        )
        session.add(blk)
        session.commit()
        session.refresh(blk)
        session.add(
            Translation(
                ocr_block_id=blk.id,
                translated_text="On y va !",
                provider="ollama",
                edited_by_user=True,
            )
        )
        session.commit()
        blk_id = str(blk.id)

    v1_resp = client.post(
        f"/projects/{project_id}/pages/{page_id}/versions",
        headers=owner["headers"],
        json={"label": "Avant retouche"},
    )
    assert v1_resp.status_code == 201, v1_resp.text
    v1_data = v1_resp.json()
    assert v1_data["version_number"] == 1
    assert v1_data["blocks_count"] == 1

    # Supprime la bulle sur la page courante
    del_blk = client.delete(f"/ocr-blocks/{blk_id}", headers=owner["headers"])
    assert del_blk.status_code == 204
    detail_after_del = client.get(f"/projects/{project_id}", headers=owner["headers"])
    assert len(detail_after_del.json()["pages"][0]["ocr_blocks"]) == 0

    # Restaure la Version 1
    restored = client.post(
        f"/projects/{project_id}/pages/{page_id}/versions/{v1_data['id']}/restore",
        headers=owner["headers"],
    )
    assert restored.status_code == 200, restored.text

    detail_after_restore = client.get(f"/projects/{project_id}", headers=owner["headers"])
    restored_blocks = detail_after_restore.json()["pages"][0]["ocr_blocks"]
    assert len(restored_blocks) == 1
    assert restored_blocks[0]["text"] == "行くぞ！"
    assert restored_blocks[0]["manhwa_style"] == "scream"
    assert restored_blocks[0]["translation"]["translated_text"] == "On y va !"


def test_admin_endpoints_rbac_and_audited_credit_grant(client: TestClient):
    normal_user = _register_and_login(client, "normal-user")
    admin_user = _register_and_login(client, "super-admin")

    # Utilisateur non-admin refusé (403)
    denied = client.get("/admin/stats", headers=normal_user["headers"])
    assert denied.status_code == 403

    # Promotion de admin_user en base
    with Session(engine) as session:
        u = session.get(User, uuid.UUID(admin_user["id"]))
        assert u is not None
        u.is_admin = True
        session.add(u)
        session.commit()

    # Accès autorisé aux statistiques et aux utilisateurs
    stats_resp = client.get("/admin/stats", headers=admin_user["headers"])
    assert stats_resp.status_code == 200, stats_resp.text
    assert stats_resp.json()["users_count"] >= 2

    users_resp = client.get("/admin/users", headers=admin_user["headers"])
    assert users_resp.status_code == 200

    # Attribution de +50 crédits à normal_user et vérification de l'audit UsageLedger
    grant_resp = client.post(
        f"/admin/users/{normal_user['id']}/credits",
        headers=admin_user["headers"],
        json={"delta": 50, "reason": "Pack test studio"},
    )
    assert grant_resp.status_code == 200, grant_resp.text
    assert grant_resp.json()["credits_remaining"] == 60  # 10 (signup) + 50

    with Session(engine) as session:
        ledgers = session.exec(
            select(UsageLedger).where(
                UsageLedger.user_id == uuid.UUID(normal_user["id"]),
                UsageLedger.action_type == "admin_grant",
            )
        ).all()
        assert len(ledgers) == 1
        assert ledgers[0].amount == 50
        assert "Pack test studio" in (ledgers[0].description or "")
