from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.billing.credit_service import (
    CREDIT_COSTS,
    deduct_credits,
    ensure_credits,
    get_or_create_subscription,
)
from app.core.db import get_session
from app.models.subscription import UsageLedger
from app.models.user import User

# Réexportés pour les routeurs projets/jobs et les tests existants.
__all__ = ["CREDIT_COSTS", "deduct_credits", "ensure_credits"]

router = APIRouter(prefix="/billing", tags=["billing"])


class RefillRequest(BaseModel):
    amount: int = 50


@router.get("/balance")
def get_balance(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    sub = get_or_create_subscription(session, current_user.id)
    return {
        "plan": sub.plan,
        "credits_remaining": sub.credits_remaining,
        "credits_limit": sub.credits_limit,
    }


@router.get("/history")
def get_billing_history(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Historique réel de consommation (ledger) + total du mois en cours."""
    entries = session.exec(
        select(UsageLedger)
        .where(UsageLedger.user_id == current_user.id)
        .order_by(UsageLedger.created_at.desc())
        .limit(100)
    ).all()
    now = datetime.now(timezone.utc)
    month_used = sum(
        entry.amount
        for entry in entries
        if entry.amount > 0
        and entry.created_at.year == now.year
        and entry.created_at.month == now.month
    )
    return {
        "month_credits_used": month_used,
        "entries": [
            {
                "id": str(entry.id),
                "action_type": entry.action_type,
                "amount": entry.amount,
                "description": entry.description,
                "project_id": str(entry.project_id) if entry.project_id else None,
                "created_at": entry.created_at.isoformat(),
            }
            for entry in entries
        ],
    }


@router.post("/refill")
def refill_credits(payload: RefillRequest, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Recharge de test (aucun paiement réel). Conservée pour les tests
    et le développement local ; les recharges achetées passent par les
    webhooks signés de `payments_router`, jamais par cet endpoint."""
    sub = get_or_create_subscription(session, current_user.id)
    sub.credits_remaining += payload.amount
    sub.credits_limit = max(sub.credits_limit, sub.credits_remaining)
    sub.updated_at = datetime.now(timezone.utc)
    session.add(sub)
    session.add(
        UsageLedger(
            user_id=current_user.id,
            action_type="recharge",
            amount=-payload.amount,
            description=f"Recharge de solde (+{payload.amount} crédits)",
        )
    )
    session.commit()
    return {
        "status": "success",
        "credits_remaining": sub.credits_remaining,
        "message": f"{payload.amount} crédits ajoutés avec succès !",
    }
