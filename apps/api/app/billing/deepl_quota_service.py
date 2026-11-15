"""Service de surveillance et de gouvernance du contingent global DeepL (Section 7).

Mesure en temps réel les caractères envoyés à l'API DeepL par l'ensemble des utilisateurs
de Taurge sur le mois en cours. Alerte et bloque les requêtes si le quota est épuisé.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.config import settings
from app.models.subscription import GlobalApiUsage

logger = logging.getLogger(__name__)

DEFAULT_DEEPL_MONTHLY_LIMIT = 500_000


def get_current_period_month() -> str:
    """Format standard de la période mensuelle : 'YYYY-MM'."""
    now = datetime.now(timezone.utc)
    return f"{now.year:04d}-{now.month:02d}"


def get_or_create_deepl_usage(session: Session, period_month: str | None = None) -> GlobalApiUsage:
    """Récupère ou initialise l'enregistrement de consommation DeepL du mois."""
    month = period_month or get_current_period_month()
    try:
        usage = session.exec(
            select(GlobalApiUsage).where(
                GlobalApiUsage.provider == "deepl",
                GlobalApiUsage.period_month == month,
            )
        ).first()
    except Exception:
        session.rollback()
        from sqlmodel import SQLModel
        try:
            SQLModel.metadata.create_all(session.bind)
        except Exception:
            pass
        usage = session.exec(
            select(GlobalApiUsage).where(
                GlobalApiUsage.provider == "deepl",
                GlobalApiUsage.period_month == month,
            )
        ).first()

    if not usage:
        limit = int(getattr(settings, "deepl_monthly_char_limit", DEFAULT_DEEPL_MONTHLY_LIMIT))
        usage = GlobalApiUsage(
            id=uuid.uuid4(),
            provider="deepl",
            period_month=month,
            chars_used=0,
            chars_limit=limit,
            requests_count=0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(usage)
        session.commit()
        session.refresh(usage)
    return usage


def check_deepl_quota_available(session: Session, chars_to_send: int) -> dict[str, Any]:
    """Vérifie si le contingent global DeepL permet d'envoyer `chars_to_send`.

    Lève HTTP 503 si le contingent est atteint, en proposant Ollama à l'utilisateur.
    """
    usage = get_or_create_deepl_usage(session)
    remaining = max(0, usage.chars_limit - usage.chars_used)

    if chars_to_send > remaining:
        percent = (usage.chars_used / usage.chars_limit * 100) if usage.chars_limit else 100
        logger.warning(
            "[DeepL Quota] Contingent mensuel dépassé : %d/%d caractères utilisés (%.1f%%). Rejet de %d caractères.",
            usage.chars_used, usage.chars_limit, percent, chars_to_send,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"Le contingent mensuel DeepL de Taurge est temporairement épuisé "
                f"({usage.chars_used:,}/{usage.chars_limit:,} caractères). "
                f"Veuillez sélectionner le moteur de traduction standard (Ollama) ou réessayer le mois prochain."
            ),
        )

    percent_used = (usage.chars_used / usage.chars_limit * 100) if usage.chars_limit else 0
    alert_level = None
    if percent_used >= 100:
        alert_level = "critical"
    elif percent_used >= 95:
        alert_level = "danger"
    elif percent_used >= 85:
        alert_level = "warning"
    elif percent_used >= 70:
        alert_level = "notice"

    return {
        "period_month": usage.period_month,
        "chars_used": usage.chars_used,
        "chars_limit": usage.chars_limit,
        "chars_remaining": remaining,
        "percent_used": round(percent_used, 1),
        "requests_count": usage.requests_count,
        "alert_level": alert_level,
    }


def record_deepl_usage(session: Session, chars_sent: int) -> GlobalApiUsage:
    """Enregistre atomiquement les caractères effectivement envoyés à DeepL."""
    if chars_sent <= 0:
        return get_or_create_deepl_usage(session)

    usage = get_or_create_deepl_usage(session)
    usage.chars_used += chars_sent
    usage.requests_count += 1
    usage.updated_at = datetime.now(timezone.utc)
    session.add(usage)
    session.commit()
    session.refresh(usage)
    return usage


def set_deepl_monthly_limit(session: Session, new_limit: int) -> GlobalApiUsage:
    """Permet à l'administrateur de redéfinir le contingent DeepL du mois."""
    if new_limit < 0:
        raise ValueError("La limite doit être un entier positif.")
    usage = get_or_create_deepl_usage(session)
    usage.chars_limit = new_limit
    usage.updated_at = datetime.now(timezone.utc)
    session.add(usage)
    session.commit()
    session.refresh(usage)
    return usage
