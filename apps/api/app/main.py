import re

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.auth.router import router as auth_router
from app.billing.router import router as billing_router
from app.billing.payment_webhooks import router as payment_webhooks_router
from app.billing.payments_router import router as payments_router
from app.exports.router import router as exports_router
from app.jobs.router import fail_orphaned_jobs, router as jobs_router
from app.ocr_blocks.router import router as ocr_blocks_router
from app.pages.router import router as pages_router
from app.projects.router import router as projects_router
from app.projects.glossary_router import router as glossary_router
from app.projects.members_router import router as members_router
from app.translations.router import router as translations_router
from app.core.config import settings
from app.core.db import init_db
from app.core.i18n import get_locale, parse_accept_language, translate_detail

app = FastAPI(title="Taurge API", version="0.4.0")


class NormalizePathMiddleware:
    """Fusionne les slashes multiples du chemin avant le routage.

    Un client qui concatène une URL de base terminée par `/` avec un
    chemin commençant par `/` envoie `//auth/register` : aucune route
    FastAPI ne correspond, d'où un 404 « Not Found » alors que la route
    existe. On normalise ici pour que l'API y réponde quand même.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            normalized = re.sub(r"/{2,}", "/", path)
            if normalized != path:
                scope = dict(scope)
                scope["path"] = normalized
                scope["raw_path"] = normalized.encode()
        await self.app(scope, receive, send)


class LocaleMiddleware(BaseHTTPMiddleware):
    """Négocie la langue de la requête depuis `Accept-Language` (Étape 4).

    La locale est posée sur `request.state.locale` ; le gestionnaire
    d'exceptions ci-dessous s'en sert pour traduire les messages d'erreur.
    """

    async def dispatch(self, request: Request, call_next):
        request.state.locale = parse_accept_language(
            request.headers.get("accept-language")
        )
        return await call_next(request)


@app.exception_handler(HTTPException)
async def localized_http_exception_handler(
    request: Request, exc: HTTPException
) -> JSONResponse:
    """Renvoie le `detail` dans la langue du client (`fr` par défaut)."""
    locale = get_locale(request)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": translate_detail(exc.detail, locale)},
        headers=exc.headers,
    )


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    # Après un crash (OOM…), les jobs pending/running sont orphelins :
    # les marquer échoués évite un suivi client sans fin.
    recovered = fail_orphaned_jobs()
    if recovered:
        import logging

        logging.getLogger(__name__).warning(
            "%s job(s) orphelin(s) marqué(s) comme échoués au démarrage.", recovered
        )


app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(payments_router)
app.include_router(payment_webhooks_router)
app.include_router(projects_router)
app.include_router(members_router)
app.include_router(glossary_router)
app.include_router(pages_router)
app.include_router(translations_router)
app.include_router(exports_router)
app.include_router(ocr_blocks_router)
app.include_router(jobs_router)

app.add_middleware(LocaleMiddleware)

_cors_origins = ["http://localhost:3000", "http://127.0.0.1:3000", "https://taurge.vercel.app"] + [
    origin.strip()
    for origin in settings.cors_origins.split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://taurge(-[a-z0-9-]+)?\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ajouté en dernier = exécuté en premier : normalise le chemin avant
# le préflight CORS et le routage.
app.add_middleware(NormalizePathMiddleware)


@app.get("/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "service": "taurge-api",
        "environment": settings.environment,
    }