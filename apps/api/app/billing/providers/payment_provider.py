# 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
"""Interface commune des passerelles de paiement Taurge.

Contrat : le frontend ne crédite jamais un solde. Il demande une URL
de paiement (`create_checkout`), l'utilisateur paie chez la passerelle,
et seul un webhook signé (`verify_webhook` + `parse_webhook`) peut
déclencher l'ajout de crédits.
"""

import hashlib
import hmac
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class CheckoutResult:
    provider_transaction_id: str
    checkout_url: str


@dataclass
class WebhookResult:
    provider_transaction_id: str
    paid: bool


class PaymentNotConfigured(RuntimeError):
    """Passerelle non configurée (clés absentes) : checkout indisponible."""


class PaymentProvider(ABC):
    name: str

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """True si les clés nécessaires sont présentes dans l'environnement."""

    @abstractmethod
    async def create_checkout(
        self, *, pack_key: str, user_id: str, user_email: str
    ) -> CheckoutResult:
        """Crée le paiement chez la passerelle et renvoie l'URL hébergée."""

    @abstractmethod
    def verify_webhook(self, raw_body: bytes, signature_header: str | None) -> bool:
        """Vérifie la signature sur le corps BRUT de la requête."""

    @abstractmethod
    def parse_webhook(self, payload: dict) -> WebhookResult:
        """Extrait l'identifiant de transaction et l'état payé ou non."""


def verify_hmac_signature(
    raw_body: bytes,
    signature_header: str | None,
    secret: str | None,
    *,
    signed_separator: str = ".",
    timestamp_tolerance_seconds: int = 300,
) -> bool:
    """Vérifie un en-tête signé : HMAC-SHA256 du secret sur
    `<ts><séparateur><corps brut>`. Échec fermé dans tous les cas."""
    if not secret or not signature_header:
        return False
    parts: dict[str, str] = {}
    for chunk in signature_header.replace(";", ",").split(","):
        if "=" in chunk:
            key, value = chunk.split("=", 1)
            parts[key.strip()] = value.strip()
    timestamp = parts.get("t") or parts.get("ts")
    signature = parts.get("v1") or parts.get("s") or parts.get("h1")
    if not timestamp or not signature:
        return False
    try:
        ts_int = int(timestamp)
    except ValueError:
        return False
    if abs(int(time.time()) - ts_int) > timestamp_tolerance_seconds:
        return False
    signed = f"{timestamp}{signed_separator}".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
