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


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("display_name", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("avatar_content_type", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("banner_content_type", sa.String(), nullable=True))
        batch_op.add_column(
            sa.Column("default_content_type", sa.String(), nullable=False, server_default="manga")
        )
        batch_op.add_column(
            sa.Column("default_source_lang", sa.String(), nullable=False, server_default="ja")
        )
        batch_op.add_column(
            sa.Column("default_target_lang", sa.String(), nullable=False, server_default="fr")
        )


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("default_target_lang")
        batch_op.drop_column("default_source_lang")
        batch_op.drop_column("default_content_type")
        batch_op.drop_column("banner_content_type")
        batch_op.drop_column("avatar_content_type")
        batch_op.drop_column("display_name")
