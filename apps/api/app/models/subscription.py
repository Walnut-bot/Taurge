import uuid
from datetime import datetime, timezone
from sqlmodel import Field, SQLModel


class Subscription(SQLModel, table=True):
    __tablename__ = "subscriptions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, unique=True)
    plan: str = Field(default="free")  # 'free', 'creator', 'studio'
    status: str = Field(default="active")  # 'active', 'canceled', 'past_due'
    credits_remaining: int = Field(default=30)
    credits_limit: int = Field(default=30)
    current_period_end: datetime | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class UsageLedger(SQLModel, table=True):
    __tablename__ = "usage_ledgers"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    project_id: uuid.UUID | None = Field(default=None, foreign_key="projects.id")
    action_type: str  # 'ocr', 'translate', 'clean', 'batch', 'recharge'
    amount: int  # nombre de crédits déduits
    description: str | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class ProjectMember(SQLModel, table=True):
    __tablename__ = "project_members"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    role: str = Field(default="translator")  # 'owner', 'translator', 'cleaner', 'typesetter', 'proofreader'
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
