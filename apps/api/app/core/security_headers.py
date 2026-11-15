"""Middleware de sécurité HTTP renforçant les en-têtes de réponse (OWASP / Secure Deployment).

Protège contre :
- Clickjacking (X-Frame-Options: SAMEORIGIN)
- MIME-type sniffing (X-Content-Type-Options: nosniff)
- Cross-Site Scripting (X-XSS-Protection: 1; mode=block)
- Fuites de référent (Referrer-Policy: strict-origin-when-cross-origin)
- Abus de capteurs matériels (Permissions-Policy)
- Interception de trafic en clair (HSTS en production)
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)

        # Protection MIME sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Protection Clickjacking
        response.headers["X-Frame-Options"] = "SAMEORIGIN"

        # Protection XSS navigateurs historiques
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Politique de référent sécurisée
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Restriction des fonctionnalités sensibles (caméra, micro, géolocalisation)
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        # Enforce HTTPS (HSTS) en production ou si la requête arrive en HTTPS
        is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
        if is_https or settings.environment == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        return response
