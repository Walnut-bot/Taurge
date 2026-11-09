"""add_user_consent_and_job_page_id

Colonnes auparavant ajoutées par les ALTER TABLE manuels de
`app.core.db` (consentement RGPD + jobs.page_id). Migration
idempotente : vérifie tables/colonnes avant d'agir, donc sûre sur
une base existante déjà complétée par l'ancien `init_db`.

Revision ID: b8c4e2a91f01
Revises: 7f2c9a1b4d03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8c4e2a91f01"
down_revision: Union[str, None] = "7f2c9a1b4d03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return set()
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("users"):
        existing = _columns("users")
        with op.batch_alter_table("users", schema=None) as batch_op:
            if "terms_accepted_at" not in existing:
                batch_op.add_column(sa.Column("terms_accepted_at", sa.DateTime(), nullable=True))
            if "age_confirmed_at" not in existing:
                batch_op.add_column(sa.Column("age_confirmed_at", sa.DateTime(), nullable=True))
            if "newsletter_opt_in" not in existing:
                batch_op.add_column(
                    sa.Column("newsletter_opt_in", sa.Boolean(), nullable=False, server_default=sa.text("0"))
                )

    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("jobs"):
        op.create_table(
            "jobs",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("project_id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("page_id", sa.Uuid(), nullable=True),
            sa.Column("job_type", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("current_page", sa.Integer(), nullable=False),
            sa.Column("total_pages", sa.Integer(), nullable=False),
            sa.Column("progress_percent", sa.Integer(), nullable=False),
            sa.Column("message", sa.String(), nullable=False),
            sa.Column("error_message", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
        )
    elif "page_id" not in _columns("jobs"):
        with op.batch_alter_table("jobs", schema=None) as batch_op:
            batch_op.add_column(sa.Column("page_id", sa.Uuid(), nullable=True))


def downgrade() -> None:
    if "page_id" in _columns("jobs"):
        with op.batch_alter_table("jobs", schema=None) as batch_op:
            batch_op.drop_column("page_id")
    if sa.inspect(op.get_bind()).has_table("users"):
        existing = _columns("users")
        with op.batch_alter_table("users", schema=None) as batch_op:
            if "newsletter_opt_in" in existing:
                batch_op.drop_column("newsletter_opt_in")
            if "age_confirmed_at" in existing:
                batch_op.drop_column("age_confirmed_at")
            if "terms_accepted_at" in existing:
                batch_op.drop_column("terms_accepted_at")
