"""Régression : le frontend déployé doit pouvoir appeler l'API.

Sans origine CORS de production par défaut, le navigateur bloque
les requêtes https://taurge.vercel.app -> https://taurge-api.onrender.com
dès que CORS_ORIGINS n'est pas posée sur Render, et l'inscription
échoue côté client alors que l'API répond.
"""
from fastapi.testclient import TestClient

from app.main import app


def _preflight(origin: str):
    with TestClient(app) as client:
        return client.options(
            "/auth/register",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )


def test_cors_preflight_allows_vercel_production():
    response = _preflight("https://taurge.vercel.app")
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://taurge.vercel.app"


def test_cors_preflight_allows_vercel_preview():
    origin = "https://taurge-abc123.vercel.app"
    response = _preflight(origin)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_cors_preflight_rejects_unknown_origin():
    response = _preflight("https://evil.example.com")
    assert "access-control-allow-origin" not in response.headers
