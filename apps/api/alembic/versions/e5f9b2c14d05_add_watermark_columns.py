"""add_watermark_columns

- `projects.default_watermark` : configuration JSON du filigrane par défaut du projet.
- `pages.watermark` : configuration JSON du filigrane spécifique à la page.

Migration idempotente.

Revision ID: e5f9b2c14d05
Revises: d4e8a1b93c04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = "e5f9b2c14d05"
down_revision: Union[str, None] = "d4e8a1b93c04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return set()
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("projects") and "default_watermark" not in _columns("projects"):
        with op.batch_alter_table("projects", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("default_watermark", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
            )

    if inspector.has_table("pages") and "watermark" not in _columns("pages"):
        with op.batch_alter_table("pages", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("watermark", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
            )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("pages") and "watermark" in _columns("pages"):
        with op.batch_alter_table("pages", schema=None) as batch_op:
            batch_op.drop_column("watermark")

    if inspector.has_table("projects") and "default_watermark" in _columns("projects"):
        with op.batch_alter_table("projects", schema=None) as batch_op:
            batch_op.drop_column("default_watermark")
