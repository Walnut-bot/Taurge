import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class LoginAttempt(SQLModel, table=True):
    """Échec de connexion persisté (rate-limit multi-instance).

    Remplace l'ancien dict en mémoire : la fenêtre glissante est
    calculée en base, donc partagée entre instances et conservée
    après redémarrage.
    """

    __tablename__ = "login_attempts"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(index=True, nullable=False)
    attempted_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )
