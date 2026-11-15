from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.billing.credit_service import (
    CREDIT_COSTS,
    add_purchased_credits,
    deduct_credits,
    ensure_credits,
    estimate_operation_cost,
    get_balance_summary,
    get_or_create_subscription,
    release_reservation,
    reserve_credits,
    settle_reservation,
)
from app.billing.deepl_quota_service import get_or_create_deepl_usage
from app.billing.tariffs import CREDIT_PACKS, SUBSCRIPTION_PLANS, TariffConfig
from app.core.db import get_session
from app.core.i18n import locale_dependency, translate_detail
from app.models.subscription import UsageLedger
from app.models.user import User

# Réexportés pour les routeurs projets/jobs et les tests existants.
__all__ = [
    "CREDIT_COSTS",
    "deduct_credits",
    "ensure_credits",
    "reserve_credits",
    "settle_reservation",
    "release_reservation",
    "estimate_operation_cost",
    "TariffConfig",
]

router = APIRouter(prefix="/billing", tags=["billing"])


class RefillRequest(BaseModel):
    amount: int = 100


class EstimateRequest(BaseModel):
    action_type: str  # 'ocr', 'translate', 'clean', 'batch'
    engine: str = "standard"  # 'ollama', 'deepl', 'opencv', 'lama'
    source_chars: int = 0
    zones_count: int = 1
    page_count: int = 1


@router.get("/balance")
def get_balance(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Situation comptable détaillée de l'utilisateur (3 poches séparées)."""
    return get_balance_summary(session, current_user.id)


@router.get("/plans")
def list_plans():
    """Grille officielle des 4 abonnements Taurge."""
    return {
        "plans": list(SUBSCRIPTION_PLANS.values()),
    }


@router.get("/deepl-quota")
def get_deepl_quota(
    _current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Consulte le contingent mensuel global DeepL et le niveau d'alerte."""
    usage = get_or_create_deepl_usage(session)
    remaining = max(0, usage.chars_limit - usage.chars_used)
    pct = (usage.chars_used / usage.chars_limit * 100) if usage.chars_limit else 0.0

    alert_level = None
    if pct >= 100:
        alert_level = "critical"
    elif pct >= 95:
        alert_level = "danger"
    elif pct >= 85:
        alert_level = "warning"
    elif pct >= 70:
        alert_level = "notice"

    return {
        "period_month": usage.period_month,
        "chars_used": usage.chars_used,
        "chars_limit": usage.chars_limit,
        "chars_remaining": remaining,
        "percent_used": round(pct, 1),
        "requests_count": usage.requests_count,
        "alert_level": alert_level,
        "is_available": remaining > 0,
    }


@router.post("/estimate")
def estimate_cost(
    payload: EstimateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Prévisualisation de coût avant toute opération payante (Partie 2.3)."""
    sub = get_or_create_subscription(session, current_user.id)
    estimate = estimate_operation_cost(
        action_type=payload.action_type,
        source_chars=payload.source_chars,
        engine=payload.engine,
        zones_count=payload.zones_count,
        page_count=payload.page_count,
    )

    available = max(
        0,
        (sub.monthly_credits_remaining + sub.purchased_credits_remaining) - sub.reserved_credits,
    )
    cost = estimate["total_cost"]
    remaining_after = available - cost

    return {
        **estimate,
        "current_balance": available,
        "monthly_remaining": sub.monthly_credits_remaining,
        "purchased_remaining": sub.purchased_credits_remaining,
        "estimated_cost": cost,
        "balance_after": remaining_after,
        "can_afford": remaining_after >= 0,
    }


@router.get("/history")
def get_billing_history(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    locale: str = Depends(locale_dependency),
    limit: int = Query(default=100, ge=1, le=500),
):
    """Historique réel et auditable de consommation (ledger) avec répartition par moteur."""
    entries = session.exec(
        select(UsageLedger)
        .where(UsageLedger.user_id == current_user.id)
        .order_by(UsageLedger.created_at.desc())
        .limit(limit)
    ).all()

    now = datetime.now(timezone.utc)
    month_used = sum(
        entry.amount
        for entry in entries
        if entry.amount > 0
        and entry.status == "completed"
        and entry.created_at.year == now.year
        and entry.created_at.month == now.month
    )

    # Répartition par catégorie d'opération sur le mois
    breakdown: dict[str, dict[str, Any]] = {
        "ocr": {"operations_count": 0, "credits_used": 0},
        "translate_ollama": {"operations_count": 0, "credits_used": 0},
        "translate_deepl": {"operations_count": 0, "credits_used": 0},
        "clean_opencv": {"operations_count": 0, "credits_used": 0},
        "clean_lama": {"operations_count": 0, "credits_used": 0},
    }

    for e in entries:
        if e.amount > 0 and e.status == "completed" and e.created_at.year == now.year and e.created_at.month == now.month:
            act = e.action_type
            eng = (e.engine_used or "").lower()
            if act == "ocr":
                breakdown["ocr"]["operations_count"] += 1
                breakdown["ocr"]["credits_used"] += e.amount
            elif act == "translate":
                key = "translate_deepl" if "deepl" in eng else "translate_ollama"
                breakdown[key]["operations_count"] += 1
                breakdown[key]["credits_used"] += e.amount
            elif act == "clean":
                key = "clean_lama" if "lama" in eng else "clean_opencv"
                breakdown[key]["operations_count"] += 1
                breakdown[key]["credits_used"] += e.amount

    return {
        "month_credits_used": month_used,
        "breakdown": breakdown,
        "entries": [
            {
                "id": str(entry.id),
                "transaction_id": entry.transaction_id,
                "action_type": entry.action_type,
                "amount": entry.amount,
                "engine_used": entry.engine_used,
                "source_chars_count": entry.source_chars_count,
                "cost_provider_actual": entry.cost_provider_actual,
                "origin": entry.origin,
                "status": entry.status,
                "description": str(translate_detail(entry.description, locale)) if entry.description else None,
                "project_id": str(entry.project_id) if entry.project_id else None,
                "page_id": str(entry.page_id) if entry.page_id else None,
                "created_at": entry.created_at.isoformat(),
            }
            for entry in entries
        ],
    }


@router.post("/refill")
def refill_credits(
    payload: RefillRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    locale: str = Depends(locale_dependency),
):
    """Recharge de test/dev local. Ajoute les crédits dans la poche `purchased_credits_remaining`."""
    total = add_purchased_credits(
        current_user.id,
        payload.amount,
        session,
        description=f"Recharge manuelle de test (+{payload.amount} crédits)",
        provider="test_refill",
    )
    return {
        "status": "success",
        "credits_remaining": total,
        "message": str(translate_detail(f"{payload.amount} crédits ajoutés avec succès !", locale)),
    }
