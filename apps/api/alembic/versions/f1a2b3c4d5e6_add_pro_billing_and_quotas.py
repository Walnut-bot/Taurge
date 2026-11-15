"""add_pro_billing_and_quotas

- `subscriptions` : ajout des poches séparées (monthly_credits_remaining, monthly_credits_limit, purchased_credits_remaining, reserved_credits).
- `usage_ledgers` : ajout des métadonnées d'audit (transaction_id, page_id, engine_used, source_chars_count, cost_provider_actual, origin, status, correlation_id).
- `global_api_usage` : nouvelle table de suivi du contingent global mensuel (DeepL).

Migration idempotente compatible SQLite et PostgreSQL.

Revision ID: f1a2b3c4d5e6
Revises: e5f9b2c14d05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e5f9b2c14d05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return set()
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # 1. Mise à jour de la table subscriptions
    if inspector.has_table("subscriptions"):
        cols = _columns("subscriptions")
        with op.batch_alter_table("subscriptions", schema=None) as batch_op:
            if "monthly_credits_remaining" not in cols:
                batch_op.add_column(
                    sa.Column("monthly_credits_remaining", sa.Integer(), nullable=False, server_default="100")
                )
            if "monthly_credits_limit" not in cols:
                batch_op.add_column(
                    sa.Column("monthly_credits_limit", sa.Integer(), nullable=False, server_default="100")
                )
            if "purchased_credits_remaining" not in cols:
                batch_op.add_column(
                    sa.Column("purchased_credits_remaining", sa.Integer(), nullable=False, server_default="0")
                )
            if "reserved_credits" not in cols:
                batch_op.add_column(
                    sa.Column("reserved_credits", sa.Integer(), nullable=False, server_default="0")
                )

        # Synchronisation initiale des soldes existants pour préserver l'historique utilisateur
        bind.execute(
            sa.text(
                "UPDATE subscriptions SET "
                "monthly_credits_remaining = CASE WHEN credits_remaining > 0 THEN credits_remaining ELSE 100 END, "
                "monthly_credits_limit = CASE WHEN credits_limit > 0 THEN credits_limit ELSE 100 END "
                "WHERE monthly_credits_remaining = 100 AND credits_remaining IS NOT NULL"
            )
        )

    # 2. Mise à jour de la table usage_ledgers
    if inspector.has_table("usage_ledgers"):
        cols = _columns("usage_ledgers")
        with op.batch_alter_table("usage_ledgers", schema=None) as batch_op:
            if "transaction_id" not in cols:
                batch_op.add_column(
                    sa.Column("transaction_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
                )
            if "page_id" not in cols:
                batch_op.add_column(
                    sa.Column("page_id", sa.Uuid() if hasattr(sa, "Uuid") else sa.CHAR(36), nullable=True)
                )
            if "engine_used" not in cols:
                batch_op.add_column(
                    sa.Column("engine_used", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
                )
            if "source_chars_count" not in cols:
                batch_op.add_column(
                    sa.Column("source_chars_count", sa.Integer(), nullable=True)
                )
            if "cost_provider_actual" not in cols:
                batch_op.add_column(
                    sa.Column("cost_provider_actual", sa.Float(), nullable=True)
                )
            if "origin" not in cols:
                batch_op.add_column(
                    sa.Column("origin", sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default="monthly")
                )
            if "status" not in cols:
                batch_op.add_column(
                    sa.Column("status", sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default="completed")
                )
            if "correlation_id" not in cols:
                batch_op.add_column(
                    sa.Column("correlation_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
                )

    # 3. Création de la table global_api_usage
    if not inspector.has_table("global_api_usage"):
        op.create_table(
            "global_api_usage",
            sa.Column("id", sa.Uuid() if hasattr(sa, "Uuid") else sa.CHAR(36), primary_key=True),
            sa.Column("provider", sqlmodel.sql.sqltypes.AutoString(), nullable=False, index=True),
            sa.Column("period_month", sqlmodel.sql.sqltypes.AutoString(), nullable=False, index=True),
            sa.Column("chars_used", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("chars_limit", sa.Integer(), nullable=False, server_default="500000"),
            sa.Column("requests_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("global_api_usage"):
        op.drop_table("global_api_usage")

    if inspector.has_table("usage_ledgers"):
        cols = _columns("usage_ledgers")
        with op.batch_alter_table("usage_ledgers", schema=None) as batch_op:
            for col_name in (
                "correlation_id", "status", "origin", "cost_provider_actual",
                "source_chars_count", "engine_used", "page_id", "transaction_id"
            ):
                if col_name in cols:
                    batch_op.drop_column(col_name)

    if inspector.has_table("subscriptions"):
        cols = _columns("subscriptions")
        with op.batch_alter_table("subscriptions", schema=None) as batch_op:
            for col_name in (
                "reserved_credits", "purchased_credits_remaining",
                "monthly_credits_limit", "monthly_credits_remaining"
            ):
                if col_name in cols:
                    batch_op.drop_column(col_name)
