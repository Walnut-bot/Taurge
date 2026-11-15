import uuid
from datetime import datetime, timezone
from sqlmodel import Field, SQLModel


class Subscription(SQLModel, table=True):
    __tablename__ = "subscriptions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, unique=True)
    plan: str = Field(default="free")  # 'free', 'creator', 'team', 'studio'
    status: str = Field(default="active")  # 'active', 'canceled', 'past_due'

    # Rétrocompatibilité : solde global hérité
    credits_remaining: int = Field(default=100)
    credits_limit: int = Field(default=100)

    # Nouvelle comptabilité stricte des poches de crédits (Partie 4 & 5)
    monthly_credits_remaining: int = Field(default=100)
    monthly_credits_limit: int = Field(default=100)
    purchased_credits_remaining: int = Field(default=0)
    reserved_credits: int = Field(default=0)

    current_period_end: datetime | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    @property
    def chars_remaining(self) -> int:
        return max(0, self.chars_limit - self.chars_used)

    @property
    def total_available(self) -> int:
        """Total des crédits réellement utilisables (mensuels + achetés - réservés)."""
        return max(
            0,
            (self.monthly_credits_remaining + self.purchased_credits_remaining) - self.reserved_credits,
        )


class UsageLedger(SQLModel, table=True):
    __tablename__ = "usage_ledgers"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    transaction_id: str | None = Field(default=None, index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    project_id: uuid.UUID | None = Field(default=None, foreign_key="projects.id")
    page_id: uuid.UUID | None = Field(default=None, foreign_key="pages.id")
    action_type: str  # 'ocr', 'translate', 'clean', 'batch', 'recharge', 'admin_grant', 'refund'
    amount: int  # nombre de crédits déduits (positif pour débit, négatif pour recharge/remboursement)
    engine_used: str | None = None  # 'manga_ocr', 'paddle_ocr', 'tesseract', 'ollama', 'deepl', 'opencv', 'lama'
    source_chars_count: int | None = None  # caractères source réels avec espaces pour traduction
    cost_provider_actual: float | None = None  # coût fournisseur estimé/réel en EUR
    origin: str = Field(default="monthly")  # 'monthly', 'purchased', 'admin'
    status: str = Field(default="completed")  # 'reserved', 'completed', 'failed', 'refunded'
    correlation_id: str | None = Field(default=None, index=True)
    description: str | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class GlobalApiUsage(SQLModel, table=True):
    """Suivi mensuel du contingent global des API externes (ex: DeepL 500k caractères)."""

    __tablename__ = "global_api_usage"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    provider: str = Field(index=True)  # 'deepl'
    period_month: str = Field(index=True)  # format 'YYYY-MM'
    chars_used: int = Field(default=0)
    chars_limit: int = Field(default=500_000)
    requests_count: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    @property
    def chars_remaining(self) -> int:
        return max(0, self.chars_limit - self.chars_used)


class ProjectMember(SQLModel, table=True):
    __tablename__ = "project_members"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    role: str = Field(default="translator")  # 'owner', 'translator', 'cleaner', 'typesetter', 'proofreader'
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
