# 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
"""FedaPay (Afrique francophone) — Mobile Money et cartes.

Flux officiel v1 : créer une transaction, générer un token de
paiement hébergé, puis confirmer côté serveur via le webhook signé
`transaction.approved` (en-tête `X-FEDAPAY-SIGNATURE`).
Aucun SDK requis : appels REST via httpx (déjà dépendance du projet).
Les montants sont en XOF entier, définis par variable d'environnement
par pack ; aucun taux EUR→XOF n'est inventé.
"""

import httpx

from app.billing.credit_service import CREDIT_PACKS
from app.billing.providers.payment_provider import (
    CheckoutResult,
    PaymentNotConfigured,
    PaymentProvider,
    WebhookResult,
    verify_hmac_signature,
)
from app.core.config import settings


class FedaPayProvider(PaymentProvider):
    name = "fedapay"

    @property
    def is_configured(self) -> bool:
        return bool(settings.fedapay_secret_key)

    def _amount_xof(self, pack_key: str) -> int | None:
        return {
            "discovery": settings.fedapay_amount_xof_discovery,
            "regular": settings.fedapay_amount_xof_regular,
            "studio": settings.fedapay_amount_xof_studio,
        }.get(pack_key)

    async def create_checkout(
        self, *, pack_key: str, user_id: str, user_email: str
    ) -> CheckoutResult:
        if not self.is_configured:
            raise PaymentNotConfigured("FedaPay non configuré (FEDAPAY_SECRET_KEY_TEST absente).")
        amount = self._amount_xof(pack_key)
        if not amount:
            raise PaymentNotConfigured(
                f"Montant XOF non configuré pour le pack {pack_key} (FEDAPAY_AMOUNT_XOF_*)."
            )
        pack = CREDIT_PACKS[pack_key]
        headers = {"Authorization": f"Bearer {settings.fedapay_secret_key}"}
        payload = {
            "description": f"Taurge — {pack['credits']} crédits ({pack_key})",
            "amount": amount,
            "currency": {"iso": "XOF"},
            "callback_url": f"{settings.public_app_url}/fr/billing",
            "customer": {"email": user_email},
        }
        async with httpx.AsyncClient(timeout=30) as client:
            created = await client.post(
                f"{settings.fedapay_api_base_url}/transactions", json=payload, headers=headers
            )
            created.raise_for_status()
            transaction = created.json().get("v1/transaction") or created.json()
            transaction_id = str(transaction["id"])
            token = await client.post(
                f"{settings.fedapay_api_base_url}/transactions/{transaction_id}/generate-token",
                json={},
                headers=headers,
            )
            token.raise_for_status()
            body = token.json()
        url = body.get("url") or (body.get("v1/token") or {}).get("url")
        if not url:
            raise PaymentNotConfigured("FedaPay n'a pas renvoyé d'URL de paiement.")
        return CheckoutResult(provider_transaction_id=transaction_id, checkout_url=url)

    def verify_webhook(self, raw_body: bytes, signature_header: str | None) -> bool:
        return verify_hmac_signature(
            raw_body, signature_header, settings.fedapay_webhook_secret, signed_separator="."
        )

    def parse_webhook(self, payload: dict) -> WebhookResult:
        entity = payload.get("entity") or payload.get("object") or {}
        event = str(payload.get("name") or payload.get("event") or "")
        status_value = str(entity.get("status") or "")
        return WebhookResult(
            provider_transaction_id=str(entity.get("id") or ""),
            paid=event.endswith("transaction.approved") or status_value == "approved",
        )
