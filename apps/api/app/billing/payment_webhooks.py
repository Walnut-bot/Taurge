# 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
"""Webhooks de paiement FedaPay et Paddle.

Sécurité : signature vérifiée sur le corps brut, échec fermé (401),
secret absent = 503. Idempotence : une transaction déjà `paid` n'est
jamais recréditée, même si la passerelle renvoie le webhook.
Seul ce module peut transformer un paiement en crédits achetés.
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.billing.credit_service import add_credits
from app.billing.providers import PROVIDERS
from app.core.config import settings
from app.core.db import get_session
from app.models.payment import PaymentTransaction

router = APIRouter(prefix="/billing/webhooks", tags=["billing-webhooks"])


async def _handle_webhook(provider_name: str, request: Request, session: Session):
    provider = PROVIDERS[provider_name]
    secret_configured = (
        settings.fedapay_webhook_secret if provider_name == "fedapay" else settings.paddle_webhook_secret
    )
    if not secret_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook non configuré (secret absent).",
        )
    raw_body = await request.body()
    header_name = "x-fedapay-signature" if provider_name == "fedapay" else "paddle-signature"
    if not provider.verify_webhook(raw_body, request.headers.get(header_name)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Signature webhook invalide."
        )
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Charge utile webhook illisible."
        ) from exc
    result = provider.parse_webhook(payload)
    if not result.provider_transaction_id:
        return {"status": "ignored"}
    transaction = session.exec(
        select(PaymentTransaction).where(
            PaymentTransaction.provider == provider_name,
            PaymentTransaction.provider_transaction_id == result.provider_transaction_id,
        )
    ).first()
    if transaction is None:
        return {"status": "ignored"}
    if transaction.status == "paid":
        return {"status": "already_processed"}
    if not result.paid:
        transaction.status = "failed"
        session.add(transaction)
        session.commit()
        return {"status": "not_paid"}
    transaction.status = "paid"
    transaction.paid_at = datetime.now(timezone.utc)
    session.add(transaction)
    session.commit()
    add_credits(
        transaction.user_id,
        transaction.credits,
        session,
        description=f"Achat {provider_name} — pack {transaction.pack_key} (+{transaction.credits} crédits)",
    )
    return {"status": "credited", "credits": transaction.credits}


@router.post("/fedapay")
async def fedapay_webhook(request: Request, session: Session = Depends(get_session)):
    return await _handle_webhook("fedapay", request, session)


@router.post("/paddle")
async def paddle_webhook(request: Request, session: Session = Depends(get_session)):
    return await _handle_webhook("paddle", request, session)
