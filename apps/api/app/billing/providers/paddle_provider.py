# 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
"""Paddle Billing (international) — checkout hébergé et webhooks signés.

Création d'une transaction ponctuelle via l'API REST Paddle
(sandbox par défaut) avec les identifiants de prix définis dans
Paddle et référencés par `PADDLE_PRICE_ID_*`. Le webhook
`transaction.completed` est vérifié par HMAC-SHA256 sur le corps brut
(en-tête `Paddle-Signature: ts=...;h1=...`, payload signé `ts:corps`).
Aucun SDK Python officiel n'est requis : appels REST via httpx.
"""

import httpx

from app.billing.providers.payment_provider import (
    CheckoutResult,
    PaymentNotConfigured,
    PaymentProvider,
    WebhookResult,
    verify_hmac_signature,
)
from app.core.config import settings


class PaddleProvider(PaymentProvider):
    name = "paddle"

    @property
    def is_configured(self) -> bool:
        return bool(settings.paddle_api_key)

    def _price_id(self, pack_key: str) -> str | None:
        return {
            "discovery": settings.paddle_price_id_discovery,
            "regular": settings.paddle_price_id_regular,
            "studio": settings.paddle_price_id_studio,
        }.get(pack_key)

    async def create_checkout(
        self, *, pack_key: str, user_id: str, user_email: str
    ) -> CheckoutResult:
        if not self.is_configured:
            raise PaymentNotConfigured("Paddle non configuré (PADDLE_API_KEY absente).")
        price_id = self._price_id(pack_key)
        if not price_id:
            raise PaymentNotConfigured(
                f"Prix Paddle non configuré pour le pack {pack_key} (PADDLE_PRICE_ID_*)."
            )
        payload = {
            "items": [{"price_id": price_id, "quantity": 1}],
            "custom_data": {"taurge_user_id": user_id, "taurge_pack": pack_key},
            "checkout": {"url": f"{settings.public_app_url}/fr/billing"},
        }
        async with httpx.AsyncClient(timeout=30) as client:
            created = await client.post(
                f"{settings.paddle_api_base_url}/transactions",
                json=payload,
                headers={"Authorization": f"Bearer {settings.paddle_api_key}"},
            )
            created.raise_for_status()
            data = created.json().get("data") or {}
        url = (data.get("checkout") or {}).get("url")
        if not data.get("id") or not url:
            raise PaymentNotConfigured(
                "Paddle n'a pas renvoyé d'URL de paiement (lien de paiement par défaut requis)."
            )
        return CheckoutResult(provider_transaction_id=str(data["id"]), checkout_url=url)

    def verify_webhook(self, raw_body: bytes, signature_header: str | None) -> bool:
        # Tolérance documentée par Paddle : 5 secondes côté SDK. On garde
        # une fenêtre courte dédiée aux webhooks Paddle.
        return verify_hmac_signature(
            raw_body,
            signature_header,
            settings.paddle_webhook_secret,
            signed_separator=":",
            timestamp_tolerance_seconds=300,
        )

    def parse_webhook(self, payload: dict) -> WebhookResult:
        data = payload.get("data") or {}
        event = str(payload.get("event_type") or "")
        status_value = str(data.get("status") or "")
        return WebhookResult(
            provider_transaction_id=str(data.get("id") or ""),
            paid=event == "transaction.completed" or status_value == "completed",
        )
