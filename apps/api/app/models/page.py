import uuid
from datetime import datetime, timezone
from sqlmodel import Field, SQLModel


class Page(SQLModel, table=True):
    __tablename__ = "pages"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    source_file_id: uuid.UUID = Field(foreign_key="source_files.id", index=True)
    page_number: int
    storage_key: str
    width: int | None = None
    height: int | None = None
    workflow_status: str | None = Field(default="todo", nullable=True)
    # Ordre d'affichage personnalisé (réordonnancement manuel).
    # NULL = jamais réordonné : repli sur (fichier source, numéro de page).
    sort_order: int | None = Field(default=None, nullable=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


def page_display_order():
    """Colonnes d'ordre d'affichage des pages.

    L'ordre personnalisé (sort_order) prime ; les pages jamais
    réordonnées (NULL) se replient sur l'ordre d'extraction, en dernier.
    """
    return (
        Page.sort_order.asc().nulls_last(),
        Page.source_file_id,
        Page.page_number,
    )