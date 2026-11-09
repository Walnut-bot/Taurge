"""Aiguillage des jobs : Celery/Redis si disponible, sinon repli.

Politique (settings.use_celery) :
- "false" : jamais de Celery, le worker DB intégré exécute tout ;
- "true"  : Celery obligatoire (l'envoi lève si le broker est muet,
  l'appelant retombe alors sur son repli local) ;
- "auto" (défaut) : Celery dès que le broker Redis répond ET qu'un
  worker Celery est vivant (ping de contrôle), sinon le worker DB
  prend le relais sans erreur — jamais de job enfilé sans consommateur.

Le ping est mis en cache 15 s pour ne pas sonder Redis à chaque job.
"""
import logging
import time
import uuid

from app.core.config import settings

logger = logging.getLogger(__name__)

TASK_NAMES = {
    "extract_pages": "taurge.extract_pages",
    "batch_process": "taurge.batch_process",
    "ocr_page": "taurge.ocr_page",
}

_ping_cache: tuple[float, bool] | None = None
_PING_TTL_SECONDS = 15.0
_worker_cache: tuple[float, bool] | None = None


def celery_enabled() -> bool:
    return settings.use_celery in ("auto", "true", "1", "yes")


def broker_reachable() -> bool:
    """True si le broker Redis répond (résultat caché 15 s)."""
    global _ping_cache
    now = time.monotonic()
    if _ping_cache is not None and now - _ping_cache[0] < _PING_TTL_SECONDS:
        return _ping_cache[1]
    reachable = False
    try:
        import redis

        client = redis.Redis.from_url(
            settings.celery_broker_url,
            socket_connect_timeout=1.0,
            socket_timeout=1.0,
        )
        reachable = bool(client.ping())
    except Exception as exc:  # broker absent, redis-py absent, URL invalide…
        logger.debug("Broker Redis injoignable : %s", exc)
    _ping_cache = (now, reachable)
    return reachable


def worker_alive() -> bool:
    """True si un worker Celery répond au ping de contrôle (caché 15 s).

    Enfiler sans consommateur laisserait le job `pending` pour
    toujours : en mode auto, on n'utilise Celery que si un worker
    est réellement là, sinon le worker intégré exécute le job.
    """
    global _worker_cache
    now = time.monotonic()
    if _worker_cache is not None and now - _worker_cache[0] < _PING_TTL_SECONDS:
        return _worker_cache[1]
    alive = False
    try:
        from app.jobs.celery_app import get_celery_app

        replies = get_celery_app().control.inspect(timeout=1.0).ping()
        alive = bool(replies)
    except Exception as exc:
        logger.debug("Aucun worker Celery détecté : %s", exc)
    _worker_cache = (now, alive)
    return alive


def dispatch_job_via_celery(
    job_type: str,
    job_id: uuid.UUID,
    *,
    page_id: uuid.UUID | None = None,
    source_file_id: uuid.UUID | None = None,
) -> bool:
    """Enfile le job dans Celery. False = à exécuter par le repli local."""
    task_name = TASK_NAMES.get(job_type)
    if task_name is None or not celery_enabled():
        return False
    if settings.use_celery != "true" and not (
        broker_reachable() and worker_alive()
    ):
        return False
    try:
        from app.jobs.celery_app import get_celery_app

        celery = get_celery_app()
        # Enregistre les tâches dans ce processus (un producteur pur,
        # sans worker, ne les a pas encore importées).
        import app.jobs.tasks  # noqa: F401
        # apply_async (et non send_task) : seul lui respecte le mode
        # eager utilisé par les tests sans broker.
        task = celery.tasks[task_name]
        if job_type == "extract_pages":
            if source_file_id is None:
                return False
            task.apply_async(args=[str(job_id), str(source_file_id)])
        elif job_type == "ocr_page":
            if page_id is None:
                return False
            task.apply_async(args=[str(job_id), str(page_id)])
        else:
            task.apply_async(args=[str(job_id)])
        logger.info("Job %s (%s) enfilé dans Celery.", job_id, job_type)
        return True
    except Exception:
        logger.exception(
            "Envoi Celery impossible pour le job %s, repli local.", job_id
        )
        return False
