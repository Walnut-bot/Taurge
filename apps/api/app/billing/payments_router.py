# 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
"""Checkout de packs de crédits (FedaPay / Paddle).

Le frontend obtient uniquement une URL de paiement hébergée. Le solde
n'est crédité que par les webhooks signés (`payment_webhooks`).
Sans clés de passerelle, le checkout répond 503 : rien n'est simulé.
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from app.auth.dependencies import get_current_user
from app.billing.credit_service import CREDIT_PACKS
from app.billing.providers import PROVIDERS, PaymentNotConfigured
from app.core.db import get_session
from app.models.payment import PaymentTransaction
from app.models.user import User

router = APIRouter(prefix="/billing", tags=["billing-payments"])


class CheckoutRequest(BaseModel):
    pack: str
    provider: str


@router.get("/packs")
def list_packs():
    return {
        "packs": [
            {
                "key": key,
                "credits": pack["credits"],
                "price_eur_cents": pack["price_eur_cents"],
            }
            for key, pack in CREDIT_PACKS.items()
        ],
        "providers": {name: provider.is_configured for name, provider in PROVIDERS.items()},
    }


@router.post("/checkout", status_code=status.HTTP_201_CREATED)
async def create_checkout(
    payload: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    pack = CREDIT_PACKS.get(payload.pack)
    if pack is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Pack inconnu.")
    provider = PROVIDERS.get(payload.provider)
    if provider is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Passerelle inconnue.")
    try:
        result = await provider.create_checkout(
            pack_key=payload.pack, user_id=str(current_user.id), user_email=current_user.email
        )
    except PaymentNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="La passerelle de paiement est injoignable."
        ) from exc
    currency = "XOF" if payload.provider == "fedapay" else "EUR"
    session.add(
        PaymentTransaction(
            user_id=current_user.id,
            provider=payload.provider,
            pack_key=payload.pack,
            credits=pack["credits"],
            amount_cents=pack["price_eur_cents"],
            currency=currency,
            provider_transaction_id=result.provider_transaction_id,
            status="pending",
        )
    )
    session.commit()
    return {"checkout_url": result.checkout_url, "provider": payload.provider, "pack": payload.pack}
