"""add_login_attempts_and_job_source_file

- `login_attempts` : rate-limit login persistant (fenêtre glissante).
- `jobs.source_file_id` : reprise des extractions par le worker DB.

Migration idempotente (vérifie tables/colonnes avant d'agir).

Revision ID: c9d5f3b02a12
Revises: b8c4e2a91f01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d5f3b02a12"
down_revision: Union[str, None] = "b8c4e2a91f01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return set()
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("login_attempts"):
        op.create_table(
            "login_attempts",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("attempted_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_login_attempts_email", "login_attempts", ["email"])
        op.create_index(
            "ix_login_attempts_attempted_at", "login_attempts", ["attempted_at"]
        )
    if inspector.has_table("jobs") and "source_file_id" not in _columns("jobs"):
        with op.batch_alter_table("jobs", schema=None) as batch_op:
            batch_op.add_column(sa.Column("source_file_id", sa.Uuid(), nullable=True))


def downgrade() -> None:
    if "source_file_id" in _columns("jobs"):
        with op.batch_alter_table("jobs", schema=None) as batch_op:
            batch_op.drop_column("source_file_id")
    if sa.inspect(op.get_bind()).has_table("login_attempts"):
        op.drop_table("login_attempts")
