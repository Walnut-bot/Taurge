import uuid
from datetime import datetime, timezone
from sqlmodel import Field, SQLModel


class Job(SQLModel, table=True):
    __tablename__ = "jobs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    page_id: uuid.UUID | None = Field(default=None, foreign_key="pages.id", index=True)
    job_type: str = Field(default="batch_process")  # 'batch_process', 'export'
    status: str = Field(default="pending")  # 'pending', 'running', 'completed', 'failed', 'cancelled'
    current_page: int = Field(default=0)
    total_pages: int = Field(default=0)
    progress_percent: int = Field(default=0)
    message: str = Field(default="En attente de démarrage...")
    error_message: str | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    completed_at: datetime | None = None