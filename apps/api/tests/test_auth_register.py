"""Régression : création de compte via l'API (Vercel -> API locale).

Le frontend construit ses URL par concaténation
(`${NEXT_PUBLIC_API_URL}/auth/register`). Si la variable se termine
par `/`, le navigateur envoie `POST //auth/register`, que le routage
FastAPI ne reconnaissait pas : 404 {"detail": "Not Found"} alors que
la route existe (vérifié en HTTP réel avec uvicorn). L'API normalise
désormais les slashes multiples, et ces tests le verrouillent.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _payload() -> dict:
    return {
        "email": f"user-{uuid.uuid4().hex[:12]}@example.com",
        "password": "password123",
        "accepted_terms": True,
        "age_confirmed": True,
        "newsletter_opt_in": False,
    }


def test_register_creates_account(client):
    payload = _payload()
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201
    assert response.json()["email"] == payload["email"]


def test_register_with_double_slash_path_creates_account(client):
    # URL complète : avec un chemin relatif, httpx interpréterait
    # `//auth/register` comme une URL protocol-relative (hôte `auth`).
    payload = _payload()
    response = client.post("http://testserver//auth/register", json=payload)
    assert response.status_code == 201
    assert response.json()["email"] == payload["email"]


def test_register_then_login(client):
    payload = _payload()
    assert client.post("/auth/register", json=payload).status_code == 201
    response = client.post(
        "/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]
