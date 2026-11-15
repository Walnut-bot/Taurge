"""Journal d'audit de sécurité et surveillance des événements sensibles (OWASP Logging & Monitoring).

Enregistre :
- Tentatives d'authentification réussies et échouées (avec adresse IP)
- Inscriptions de nouveaux comptes
- Refus d'accès / accès interdits (401 / 403 / IDOR)
- Dépassements de quota ou de limite de débit
- Comportements anormaux ou erreurs critiques
"""

from __future__ import annotations

import logging
from typing import Any

audit_logger = logging.getLogger("taurge.audit")


def log_auth_success(email: str, user_id: str, ip: str) -> None:
    audit_logger.info("AUDIT_AUTH_SUCCESS: email=%s user_id=%s ip=%s", email, user_id, ip)


def log_auth_failure(email: str, ip: str, reason: str) -> None:
    audit_logger.warning("AUDIT_AUTH_FAILURE: email=%s ip=%s reason=%s", email, ip, reason)


def log_registration(email: str, user_id: str, ip: str) -> None:
    audit_logger.info("AUDIT_USER_REGISTER: email=%s user_id=%s ip=%s", email, user_id, ip)


def log_access_denied(path: str, ip: str, user_id: str | None = None, reason: str = "forbidden") -> None:
    audit_logger.warning("AUDIT_ACCESS_DENIED: path=%s ip=%s user_id=%s reason=%s", path, ip, user_id, reason)


def log_rate_limit(ip: str, endpoint: str) -> None:
    audit_logger.warning("AUDIT_RATE_LIMIT_TRIGGERED: ip=%s endpoint=%s", ip, endpoint)


def log_security_event(event_name: str, **kwargs: Any) -> None:
    audit_logger.warning("AUDIT_SECURITY_EVENT: event=%s details=%s", event_name, kwargs)
