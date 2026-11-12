import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True, nullable=False)
    password_hash: str
    display_name: str | None = Field(default=None, max_length=80)
    avatar_content_type: str | None = Field(default=None, max_length=50)
    banner_content_type: str | None = Field(default=None, max_length=50)
    default_content_type: str = Field(default="manga")
    default_source_lang: str = Field(default="ja")
    default_target_lang: str = Field(default="fr")
    # Preuves de consentement RGPD (horodatées à l'inscription)
    terms_accepted_at: datetime | None = Field(default=None)
    age_confirmed_at: datetime | None = Field(default=None)
    newsletter_opt_in: bool = Field(default=False)
    is_admin: bool = Field(default=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
