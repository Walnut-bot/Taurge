"""add_comments_versions_and_admin

- `users.is_admin` : rôle global administrateur (Section 34).
- `page_comments` : commentaires collaboratifs par page / bulle (Section 18).
- `page_versions` : historique de versions et snapshots restaurables par page (Section 19).

Migration idempotente.

Revision ID: d4e8a1b93c04
Revises: c9d5f3b02a12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e8a1b93c04"
down_revision: Union[str, None] = "c9d5f3b02a12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return set()
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("users") and "is_admin" not in _columns("users"):
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false())
            )

    if not inspector.has_table("page_comments"):
        op.create_table(
            "page_comments",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("project_id", sa.Uuid(), nullable=False),
            sa.Column("page_id", sa.Uuid(), nullable=False),
            sa.Column("ocr_block_id", sa.Uuid(), nullable=True),
            sa.Column("author_id", sa.Uuid(), nullable=False),
            sa.Column("author_email", sa.String(length=255), nullable=False),
            sa.Column("content", sa.String(length=2000), nullable=False),
            sa.Column("is_resolved", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_page_comments_project_id", "page_comments", ["project_id"])
        op.create_index("ix_page_comments_page_id", "page_comments", ["page_id"])

    if not inspector.has_table("page_versions"):
        op.create_table(
            "page_versions",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("project_id", sa.Uuid(), nullable=False),
            sa.Column("page_id", sa.Uuid(), nullable=False),
            sa.Column("version_number", sa.Integer(), nullable=False),
            sa.Column("label", sa.String(length=120), nullable=False),
            sa.Column("created_by_id", sa.Uuid(), nullable=False),
            sa.Column("created_by_email", sa.String(length=255), nullable=False),
            sa.Column("snapshot_json", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_page_versions_project_id", "page_versions", ["project_id"])
        op.create_index("ix_page_versions_page_id", "page_versions", ["page_id"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("page_versions"):
        op.drop_table("page_versions")
    if inspector.has_table("page_comments"):
        op.drop_table("page_comments")
    if "is_admin" in _columns("users"):
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.drop_column("is_admin")
