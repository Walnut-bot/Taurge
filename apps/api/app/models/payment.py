# 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class PaymentTransaction(SQLModel, table=True):
    """Achat de crédits : créée avant redirection, créditée par webhook."""

    __tablename__ = "payment_transactions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    provider: str = Field(index=True)  # 'fedapay' | 'paddle'
    pack_key: str  # 'discovery' | 'regular' | 'studio'
    credits: int
    amount_cents: int
    currency: str  # 'EUR' | 'XOF'
    provider_transaction_id: str | None = Field(default=None, unique=True, index=True)
    status: str = Field(default="pending", index=True)  # pending | paid | failed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    paid_at: datetime | None = None
