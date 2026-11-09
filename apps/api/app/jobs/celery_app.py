"""Application Celery Taurge (broker + backend Redis).

Lancement du worker (processus séparé, à côté de l'API) :

    celery -A app.jobs.celery_app worker --pool=solo -l info

(`--pool=solo` est le mode compatible Windows ; sous Linux/Docker,
le pool par défaut convient.) Les tâches vivent dans app.jobs.tasks
et délèguent à app.jobs.execution : le claim atomique en base rend
l'exécution unique, que le job parte par Celery ou par le worker DB.
"""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_celery_app = None


def get_celery_app():
    """Crée (une fois) l'application Celery depuis la configuration."""
    global _celery_app
    if _celery_app is not None:
        return _celery_app
    from celery import Celery

    app = Celery(
        "taurge",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
        include=["app.jobs.tasks"],
    )
    app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        # Les traitements lourds (OCR, batch) peuvent durer : on laisse
        # au worker le temps de finir avant que Redis ne réattribue.
        broker_transport_options={"visibility_timeout": 6 * 3600},
        worker_prefetch_multiplier=1,
    )
    _celery_app = app
    return app


# Point d'entrée du CLI Celery (`celery -A app.jobs.celery_app`).
celery_app = get_celery_app()
app = celery_app
