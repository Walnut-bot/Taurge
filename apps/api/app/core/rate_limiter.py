"""Système de protection contre les abus, attaques de robots et brute-force (OWASP API Security).

Fournit un contrôle de débit (Rate Limiting) par fenêtre glissante thread-safe :
1. Création de comptes (`/auth/register`) : protection anti-création massive de bots.
2. Authentification (`/auth/login`) : protection anti bourrage d'identifiants (Credential Stuffing).
3. Requêtes d'IA (`/jobs/*`, `/ocr`, `/translate`, `/clean`) : protection anti-dépassement et surcoût API.
4. Protection générale anti-scraping / DoS sur l'ensemble de l'API.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict
from typing import NamedTuple

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

logger = logging.getLogger("taurge.security")


class RateLimitRule(NamedTuple):
    max_requests: int
    window_seconds: int


# Règles par catégorie
DEFAULT_RULES: dict[str, RateLimitRule] = {
    # 10 créations de compte max par 15 minutes par IP
    "register": RateLimitRule(max_requests=10, window_seconds=15 * 60),
    # 20 tentatives de login par 5 minutes par IP
    "login": RateLimitRule(max_requests=20, window_seconds=5 * 60),
    # 60 opérations d'IA lourdes par minute
    "ai_generation": RateLimitRule(max_requests=60, window_seconds=60),
    # 300 requêtes API générales par minute (anti-scraping)
    "general": RateLimitRule(max_requests=300, window_seconds=60),
}


class SlidingWindowRateLimiter:
    """Limiteur de débit en mémoire à fenêtre glissante avec verrou de synchronisation."""

    def __init__(self):
        self._lock = threading.Lock()
        # bucket_key -> list of timestamp floats
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._last_clean = time.time()

    def _cleanup_old_hits(self, now: float) -> None:
        """Nettoie périodiquement les entrées expirées pour libérer la mémoire."""
        if now - self._last_clean < 60:
            return
        self._last_clean = now
        expired_keys = []
        for key, timestamps in list(self._hits.items()):
            # Conserve seulement les timestamps des 30 dernières minutes max
            valid = [t for t in timestamps if now - t < 1800]
            if valid:
                self._hits[key] = valid
            else:
                expired_keys.append(key)
        for key in expired_keys:
            self._hits.pop(key, None)

    def check_rate_limit(
        self,
        identifier: str,
        category: str = "general",
        custom_rule: RateLimitRule | None = None,
    ) -> tuple[bool, int, int]:
        """Vérifie si la requête est autorisée.

        Retourne : (is_allowed, remaining_requests, retry_after_seconds)
        """
        # En mode test, si non configuré explicitement, on assouplit pour les tests automatisés
        if settings.environment == "test" and category not in ("test_rate_limit", "login_test"):
            return True, 999, 0

        rule = custom_rule or DEFAULT_RULES.get(category, DEFAULT_RULES["general"])
        now = time.time()
        bucket_key = f"{category}:{identifier}"

        with self._lock:
            self._cleanup_old_hits(now)
            cutoff = now - rule.window_seconds
            timestamps = self._hits[bucket_key]

            # Filtrer les frappes hors de la fenêtre courante
            valid_timestamps = [t for t in timestamps if t > cutoff]
            self._hits[bucket_key] = valid_timestamps

            count = len(valid_timestamps)
            if count >= rule.max_requests:
                oldest = valid_timestamps[0]
                retry_after = max(1, int(rule.window_seconds - (now - oldest)))
                return False, 0, retry_after

            # Enregistrer la requête courante
            self._hits[bucket_key].append(now)
            remaining = rule.max_requests - (count + 1)
            return True, remaining, 0

    def reset(self) -> None:
        """Réinitialise tous les compteurs (utile pour les tests)."""
        with self._lock:
            self._hits.clear()


# Instance globale du limiteur de débit
rate_limiter = SlidingWindowRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extrait l'adresse IP cliente réelle même derrière un proxy/reverse proxy."""
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip:
        return x_real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"


def enforce_rate_limit(
    request: Request,
    category: str = "general",
    custom_rule: RateLimitRule | None = None,
) -> None:
    """Dépendance ou fonction utilitaire pour bloquer immédiatement les abus (HTTP 429)."""
    ip = get_client_ip(request)
    allowed, remaining, retry_after = rate_limiter.check_rate_limit(
        identifier=ip,
        category=category,
        custom_rule=custom_rule,
    )

    if not allowed:
        logger.warning(
            "SECURITY_RATE_LIMIT_EXCEEDED: IP=%s category=%s path=%s retry_after=%ss",
            ip,
            category,
            request.url.path,
            retry_after,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Trop de requêtes. Veuillez patienter {retry_after} seconde(s) avant de réessayer.",
            headers={"Retry-After": str(retry_after)},
        )


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware global de protection anti-abus et anti-déni de service (DoS/Botnet)."""

    async def dispatch(self, request: Request, call_next):
        # Laisser passer les requêtes preflight CORS et le point de contrôle de vie
        if request.method == "OPTIONS" or request.url.path in ("/health", "/docs", "/openapi.json"):
            return await call_next(request)

        path = request.url.path.lower()
        category = "general"

        if path.startswith("/auth/register"):
            category = "register"
        elif path.startswith("/auth/login"):
            category = "login"
        elif any(k in path for k in ("start-ocr", "start-batch", "start-extraction", "/ocr", "/translate", "/clean")):
            category = "ai_generation"

        ip = get_client_ip(request)

        # Les fixtures de tests automatisés (TestClient) ne doivent pas s'auto-bloquer
        if ip == "testclient" and not request.headers.get("x-enforce-rate-limit"):
            response = await call_next(request)
            return response

        allowed, remaining, retry_after = rate_limiter.check_rate_limit(ip, category)

        if not allowed:
            from fastapi.responses import JSONResponse

            logger.warning(
                "SECURITY_RATE_LIMIT_BLOCKED: IP=%s category=%s path=%s retry_after=%ss",
                ip,
                category,
                request.url.path,
                retry_after,
            )
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": f"Limite de requêtes atteinte ({category}). Veuillez patienter {retry_after} seconde(s) avant de réessayer."
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
