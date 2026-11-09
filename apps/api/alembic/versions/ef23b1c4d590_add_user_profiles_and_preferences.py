"""add_user_profiles_and_preferences

Revision ID: ef23b1c4d590
Revises: dbd43514d870
Create Date: 2026-10-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ef23b1c4d590"
down_revision: Union[str, None] = "dbd43514d870"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return set()
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    # Idempotent : une base partiellement migrée (ex. tamponnée `head`
    # par erreur alors que create_all avait déjà ajouté ces colonnes)
    # doit pouvoir rejouer la migration sans doublon.
    existing = _columns("users")
    if not existing:
        return
    new_columns = [
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column("avatar_content_type", sa.String(), nullable=True),
        sa.Column("banner_content_type", sa.String(), nullable=True),
        sa.Column("default_content_type", sa.String(), nullable=False, server_default="manga"),
        sa.Column("default_source_lang", sa.String(), nullable=False, server_default="ja"),
        sa.Column("default_target_lang", sa.String(), nullable=False, server_default="fr"),
    ]
    with op.batch_alter_table("users", schema=None) as batch_op:
        for column in new_columns:
            if column.name not in existing:
                batch_op.add_column(column)


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("default_target_lang")
        batch_op.drop_column("default_source_lang")
        batch_op.drop_column("default_content_type")
        batch_op.drop_column("banner_content_type")
        batch_op.drop_column("avatar_content_type")
        batch_op.drop_column("display_name")
