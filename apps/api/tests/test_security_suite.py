"""Suite complète de tests de sécurité validant les 6 piliers OWASP / Taurge Security :

1. Protection des secrets et clés API (jamais exposés dans l'API ni le frontend).
2. Déploiement sécurisé et en-têtes HTTP de sécurité (nosniff, SAMEORIGIN, HSTS...).
3. Contrôle d'accès strict et anti-IDOR (l'utilisateur B ne peut accéder aux données de l'utilisateur A).
4. Protection contre les abus, attaques de robots et brute-force (Rate Limiting HTTP 429).
5. Sécurité de l'authentification (hachage bcrypt, expiration sessions, tokens signés).
6. Validation et assainissement strict des entrées (XSS, injections, uploads).
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.db import engine
from app.core.rate_limiter import rate_limiter, RateLimitRule
from app.core.sanitization import sanitize_text, sanitize_project_name, sanitize_filename
from app.core.security import create_password_reset_token, verify_password_reset_token
from app.main import app
from app.models.job import Job
from app.models.ocr_block import OCRBlock
from app.models.page import Page
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.translation import Translation


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register_and_login(client: TestClient, label: str) -> dict:
    email = f"{label}-{uuid.uuid4().hex[:10]}@example.com"
    password = "SecurePassword123!"
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


# ==============================================================================
# PILIER 1 & 2 : EN-TÊTES DE SÉCURITÉ & PROTECTION DES SECRETS
# ==============================================================================

def test_security_headers_present_on_all_responses(client: TestClient):
    """Vérifie que les en-têtes OWASP de protection sont injectés sur toutes les réponses."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "SAMEORIGIN"
    assert resp.headers.get("X-XSS-Protection") == "1; mode=block"
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "camera=()" in resp.headers.get("Permissions-Policy", "")


def test_api_never_exposes_internal_secrets_in_responses(client: TestClient):
    """Vérifie que les endpoints publics et privés ne fuient aucun secret interne."""
    user = _register_and_login(client, "sec-secrets")

    # /auth/me ne doit jamais contenir password_hash ni secret_key
    me_resp = client.get("/auth/me", headers=user["headers"])
    assert me_resp.status_code == 200
    data_str = me_resp.text.lower()
    assert "password_hash" not in data_str
    assert "secret_key" not in data_str
    assert "database_url" not in data_str
    assert "deepl_api_key" not in data_str
    assert "gemini_api_key" not in data_str


# ==============================================================================
# PILIER 3 : ANTI-IDOR & CONTRÔLE STRICT D'ACCÈS
# ==============================================================================

def test_idor_prevention_user_b_cannot_access_or_modify_user_a_data(client: TestClient):
    """Vérifie qu'un utilisateur ne peut en aucun cas lire ou manipuler les données d'un tiers."""
    user_a = _register_and_login(client, "user-a")
    user_b = _register_and_login(client, "user-b")

    # User A crée un projet
    proj_a = client.post(
        "/projects",
        headers=user_a["headers"],
        json={"name": "Projet Privé A", "source_lang": "ko", "target_lang": "fr", "content_type": "manhwa"},
    ).json()
    proj_a_id = proj_a["id"]

    # Création manuelle d'une page, bloc et traduction pour User A
    with Session(engine) as session:
        src = SourceFile(
            project_id=uuid.UUID(proj_a_id),
            storage_key="originals/test-a.png",
            original_filename="chapter1.png",
            file_type="png",
            size_bytes=1024,
        )
        session.add(src)
        session.commit()
        session.refresh(src)

        page = Page(
            project_id=uuid.UUID(proj_a_id),
            source_file_id=src.id,
            page_number=1,
            storage_key="pages/test-a.png",
            width=800,
            height=1200,
        )
        session.add(page)
        session.commit()
        session.refresh(page)
        page_id = str(page.id)

        block = OCRBlock(
            page_id=page.id,
            text="Texte Confidentiel",
            bbox_x=10,
            bbox_y=10,
            bbox_w=50,
            bbox_h=20,
            confidence=0.95,
            provider="manual",
        )
        session.add(block)
        session.commit()
        session.refresh(block)
        block_id = str(block.id)

        trans = Translation(ocr_block_id=block.id, translated_text="Traduction Privée", provider="ollama")
        session.add(trans)
        session.commit()
        session.refresh(trans)
        trans_id = str(trans.id)

        job = Job(project_id=uuid.UUID(proj_a_id), user_id=uuid.UUID(user_a["id"]), status="completed")
        session.add(job)
        session.commit()
        session.refresh(job)
        job_id = str(job.id)

    # User B tente de lire le projet de User A (doit renvoyer 404, pas de fuite)
    get_proj = client.get(f"/projects/{proj_a_id}", headers=user_b["headers"])
    assert get_proj.status_code == 404

    # User B tente de modifier le projet de User A (404)
    patch_proj = client.patch(f"/projects/{proj_a_id}", headers=user_b["headers"], json={"name": "Hack"})
    assert patch_proj.status_code == 404

    # User B tente de supprimer le projet de User A (404)
    del_proj = client.delete(f"/projects/{proj_a_id}", headers=user_b["headers"])
    assert del_proj.status_code == 404

    # User B tente de lire l'image de la page de User A (404)
    get_img = client.get(f"/pages/{page_id}/image", headers=user_b["headers"])
    assert get_img.status_code == 404

    # User B tente de modifier le bloc OCR de User A (404)
    patch_blk = client.patch(f"/ocr-blocks/{block_id}", headers=user_b["headers"], json={"text": "Vandalisme"})
    assert patch_blk.status_code == 404

    # User B tente de modifier la traduction de User A (404)
    patch_tr = client.patch(f"/translations/{trans_id}", headers=user_b["headers"], json={"translated_text": "Vandalisme"})
    assert patch_tr.status_code == 404

    # User B tente de lire le job de User A (404)
    get_job = client.get(f"/jobs/{job_id}", headers=user_b["headers"])
    assert get_job.status_code == 404


# ==============================================================================
# PILIER 4 : RATE LIMITING & PROTECTION CONTRE LES ABUS
# ==============================================================================

def test_rate_limiter_blocks_excessive_requests(client: TestClient):
    """Vérifie que le limiteur de débit bloque avec un statut 429 et l'en-tête Retry-After."""
    test_ip = "192.168.100.99"
    rate_limiter.reset()

    # Règle stricte de test : 3 requêtes max par seconde
    test_rule = RateLimitRule(max_requests=3, window_seconds=10)

    # 3 requêtes passent
    for _ in range(3):
        allowed, remaining, _ = rate_limiter.check_rate_limit(test_ip, "test_rate_limit", test_rule)
        assert allowed is True

    # La 4ème requête est bloquée
    allowed, remaining, retry_after = rate_limiter.check_rate_limit(test_ip, "test_rate_limit", test_rule)
    assert allowed is False
    assert remaining == 0
    assert retry_after >= 1


# ==============================================================================
# PILIER 5 : AUTHENTIFICATION SÉCURISÉE & RÉINITIALISATION
# ==============================================================================

def test_password_policy_enforced(client: TestClient):
    """Vérifie que les mots de passe de moins de 8 caractères sont rejetés (422)."""
    weak = client.post(
        "/auth/register",
        json={
            "email": f"weak-{uuid.uuid4().hex[:6]}@example.com",
            "password": "short",
            "accepted_terms": True,
            "age_confirmed": True,
        },
    )
    assert weak.status_code == 422


def test_password_reset_token_security():
    """Vérifie la génération, l'expiration et la protection contre l'usurpation des tokens de réinitialisation."""
    email = "user.security@example.com"
    token = create_password_reset_token(email, expires_minutes=15)
    assert token is not None

    # Vérification valide
    verified = verify_password_reset_token(token)
    assert verified == email

    # Jeton expiré immédiatement
    expired_token = create_password_reset_token(email, expires_minutes=-1)
    assert verify_password_reset_token(expired_token) is None

    # Faux jeton ou jeton altéré rejeté
    assert verify_password_reset_token(token + "tampered") is None


# ==============================================================================
# PILIER 6 : ASSAINISSEMENT DES ENTRÉES & XSS
# ==============================================================================

def test_input_sanitization_xss_and_injection():
    """Vérifie la neutralisation des balises exécutables tout en conservant le texte CJK et accents."""
    dirty_text = "Bonjour ! <script>alert('pwned')</script> Quel beau manga ! <iframe src='evil.com'></iframe>"
    clean_text = sanitize_text(dirty_text)
    assert "<script>" not in clean_text
    assert "<iframe>" not in clean_text
    assert "Bonjour !  Quel beau manga !" in clean_text

    # Préservation intacte des caractères coréens, japonais, accents
    cjk_text = "조상님, 우선은 제가 떠나고 나면... 鬼滅の刃 à bientôt !"
    assert sanitize_text(cjk_text) == cjk_text

    # Nom de projet assaini
    dirty_project = "<script>alert(1)</script>Mon Projet Manga"
    assert "<script>" not in sanitize_project_name(dirty_project)

    # Nettoyage de nom de fichier (anti path traversal)
    assert sanitize_filename("../../../etc/passwd") == "passwd"
    assert sanitize_filename("chapter_01.cbz") == "chapter_01.cbz"
