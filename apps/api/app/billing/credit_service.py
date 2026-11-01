# 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
"""Service crédits Taurge — source unique de vérité du solde.

Règles verrouillées avec le produit :
- 1 crédit par action IA réussie (OCR, traduction, nettoyage), débité
  APRÈS succès seulement ; le pipeline complet d'une page coûte donc
  3 crédits lorsqu'il exécute les trois étapes.
- Vérification préalable du solde : HTTP 402 si insuffisant.
- Débit atomique (`UPDATE ... WHERE solde >= montant`) : jamais de
  solde négatif, même en cas de traitements concurrents.
- 10 crédits offerts à l'inscription d'un nouveau compte.
- Les recharges achetées ne sont créditées que par les webhooks de
  paiement signés (voir `payments_router`), jamais par le frontend.
"""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import update as sa_update
from sqlmodel import Session, select

from app.models.subscription import Subscription, UsageLedger

SIGNUP_FREE_CREDITS = 10

#: Coût en crédits par action IA et par page.
CREDIT_COSTS = {"ocr": 1, "translate": 1, "clean": 1}

#: Packs de crédits vendus (prix EUR en centimes, source backend).
CREDIT_PACKS: dict[str, dict] = {
    "discovery": {"credits": 50, "price_eur_cents": 299},
    "regular": {"credits": 200, "price_eur_cents": 999},
    "studio": {"credits": 500, "price_eur_cents": 2199},
}


def get_or_create_subscription(
    session: Session, user_id: uuid.UUID, initial_credits: int = SIGNUP_FREE_CREDITS
) -> Subscription:
    sub = session.exec(select(Subscription).where(Subscription.user_id == user_id)).first()
    if not sub:
        sub = Subscription(
            user_id=user_id,
            plan="free",
            credits_remaining=initial_credits,
            credits_limit=initial_credits,
        )
        session.add(sub)
        session.commit()
        session.refresh(sub)
    return sub


def _insufficient_message(remaining: int, amount: int) -> str:
    return (
        f"Crédits insuffisants ({remaining} restants, {amount} requis). "
        "Veuillez recharger votre solde."
    )


def ensure_credits(user_id: uuid.UUID, amount: int, session: Session) -> None:
    """Vérifie le solde sans débiter. Lève 402 si insuffisant (fail-fast)."""
    sub = get_or_create_subscription(session, user_id)
    if sub.credits_remaining < amount:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=_insufficient_message(sub.credits_remaining, amount),
        )


def deduct_credits(
    user_id: uuid.UUID,
    amount: int,
    action_type: str,
    session: Session,
    project_id: uuid.UUID | None = None,
) -> int:
    """Débite atomiquement après un traitement réussi. Lève 402 si solde insuffisant."""
    sub = get_or_create_subscription(session, user_id)
    result = session.execute(
        sa_update(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.credits_remaining >= amount,
        )
        .values(
            credits_remaining=Subscription.credits_remaining - amount,
            updated_at=datetime.now(timezone.utc),
        )
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=_insufficient_message(sub.credits_remaining, amount),
        )
    session.add(
        UsageLedger(
            user_id=user_id,
            project_id=project_id,
            action_type=action_type,
            amount=amount,
            description=f"Consommation {action_type} (-{amount} crédits)",
        )
    )
    session.commit()
    session.refresh(sub)
    return sub.credits_remaining


def add_credits(
    user_id: uuid.UUID,
    amount: int,
    session: Session,
    description: str = "Recharge de crédits",
) -> int:
    """Crédite un solde (webhook de paiement validé uniquement) et journalise."""
    if amount <= 0:
        raise ValueError("Le nombre de crédits à ajouter doit être positif.")
    sub = get_or_create_subscription(session, user_id)
    session.execute(
        sa_update(Subscription)
        .where(Subscription.user_id == user_id)
        .values(
            credits_remaining=Subscription.credits_remaining + amount,
            credits_limit=Subscription.credits_limit + amount,
            updated_at=datetime.now(timezone.utc),
        )
    )
    session.add(
        UsageLedger(
            user_id=user_id,
            action_type="recharge",
            amount=-amount,
            description=description,
        )
    )
    session.commit()
    session.refresh(sub)
    return sub.credits_remaining
