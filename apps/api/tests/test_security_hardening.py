"""Durcissement : flux SSE des jobs authentifié et login limité en débit.

Constats du test manuel complet :
- `GET /jobs/{id}/stream` répondait 200 sans aucun token, alors que
  `GET /jobs/{id}` exige l'authentification et vérifie l'accès au projet.
- Aucune limite sur les mots de passe essayés : 8 échecs de login
  d'affilée passaient sans blocage ni délai.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.db import engine
from app.main import app
from app.models.job import Job


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
    assert me.status_code == 200, me.text
    return {"id": me.json()["id"], "email": email, "password": password, "headers": headers}


def test_job_stream_requires_authentication_and_project_access(client):
    owner = _register_and_login(client, "sse-owner")
    outsider = _register_and_login(client, "sse-outsider")
    project = client.post(
        "/projects",
        headers=owner["headers"],
        json={
            "name": "Projet SSE",
            "source_lang": "ja",
            "target_lang": "fr",
            "content_type": "manga",
        },
    )
    assert project.status_code == 201, project.text

    job_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            Job(
                id=job_id,
                project_id=uuid.UUID(project.json()["id"]),
                user_id=uuid.UUID(owner["id"]),
                status="completed",
            )
        )
        session.commit()

    # Sans token : refusé, comme le reste de l'API.
    anonymous = client.get(f"/jobs/{job_id}/stream")
    assert anonymous.status_code in (401, 403), anonymous.text

    # Connecté mais sans accès au projet : 404, comme GET /jobs/{id}.
    forbidden = client.get(f"/jobs/{job_id}/stream", headers=outsider["headers"])
    assert forbidden.status_code == 404, forbidden.text

    # Le propriétaire reçoit le flux et l'état du job terminé.
    with client.stream(
        "GET", f"/jobs/{job_id}/stream", headers=owner["headers"]
    ) as response:
        assert response.status_code == 200, response.text
        first_line = next(response.iter_lines())
        assert "completed" in first_line


def test_login_is_rate_limited_after_repeated_failures(client):
    user = _register_and_login(client, "rate-limited")
    for _ in range(5):
        failed = client.post(
            "/auth/login",
            json={"email": user["email"], "password": "wrong-password"},
        )
        assert failed.status_code == 401, failed.text

    # Même avec le bon mot de passe, le compte est temporairement bloqué.
    blocked = client.post(
        "/auth/login",
        json={"email": user["email"], "password": user["password"]},
    )
    assert blocked.status_code == 429, blocked.text
