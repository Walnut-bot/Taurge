"""add_sort_order_to_pages

Revision ID: 7f2c9a1b4d03
Revises: ef23b1c4d590
Create Date: 2026-10-28 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '7f2c9a1b4d03'
down_revision: Union[str, None] = 'ef23b1c4d590'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column() -> bool:
    inspector = sa.inspect(op.get_bind())
    return inspector.has_table('pages') and any(
        c['name'] == 'sort_order' for c in inspector.get_columns('pages')
    )


def upgrade() -> None:
    # Idempotent : la colonne a pu être ajoutée par l'ancien init_db.
    if not _has_column():
        with op.batch_alter_table('pages', schema=None) as batch_op:
            batch_op.add_column(sa.Column('sort_order', sa.Integer(), nullable=True))


def downgrade() -> None:
    if _has_column():
        with op.batch_alter_table('pages', schema=None) as batch_op:
            batch_op.drop_column('sort_order')
