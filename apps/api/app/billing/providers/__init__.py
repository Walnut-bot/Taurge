# 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
from app.billing.providers.fedapay_provider import FedaPayProvider
from app.billing.providers.paddle_provider import PaddleProvider
from app.billing.providers.payment_provider import (
    CheckoutResult,
    PaymentNotConfigured,
    PaymentProvider,
    WebhookResult,
)

PROVIDERS: dict[str, PaymentProvider] = {
    "fedapay": FedaPayProvider(),
    "paddle": PaddleProvider(),
}

__all__ = [
    "PROVIDERS",
    "CheckoutResult",
    "PaymentNotConfigured",
    "PaymentProvider",
    "WebhookResult",
    "FedaPayProvider",
    "PaddleProvider",
]
