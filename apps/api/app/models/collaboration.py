import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class PageComment(SQLModel, table=True):
    """Commentaire collaboratif sur une page ou une bulle spécifique (Section 18)."""

    __tablename__ = "page_comments"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    page_id: uuid.UUID = Field(foreign_key="pages.id", index=True)
    ocr_block_id: uuid.UUID | None = Field(default=None, index=True)
    author_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    author_email: str = Field(max_length=255)
    content: str = Field(max_length=2000)
    is_resolved: bool = Field(default=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class PageVersion(SQLModel, table=True):
    """Snapshot versionné de l'état d'une page : blocs OCR, traductions et styles (Section 19)."""

    __tablename__ = "page_versions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    page_id: uuid.UUID = Field(foreign_key="pages.id", index=True)
    version_number: int = Field(default=1)
    label: str = Field(default="Version", max_length=120)
    created_by_id: uuid.UUID = Field(foreign_key="users.id")
    created_by_email: str = Field(max_length=255)
    snapshot_json: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
