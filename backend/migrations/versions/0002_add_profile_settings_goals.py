"""add profile, settings, goals

Adds the profile columns and the token hash to users, plus the user_settings and goals tables.

users.token_hash is NOT NULL. That is safe because nothing could create users before this
version (no endpoint existed), so the table is empty when this runs.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "goals",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("calories", sa.Integer(), nullable=False),
        sa.Column("protein_g", sa.Integer(), nullable=False),
        sa.Column("fat_g", sa.Integer(), nullable=False),
        sa.Column("carb_g", sa.Integer(), nullable=False),
        sa.Column("weight_kg", sa.Double(), nullable=False),
        sa.Column("bmr", sa.Double(), nullable=False),
        sa.Column("tdee", sa.Double(), nullable=False),
        sa.Column("daily_adjustment", sa.Double(), nullable=False),
        sa.Column("rate_kg_per_week", sa.Double(), nullable=False),
        sa.Column("rate_was_capped", sa.Boolean(), nullable=False),
        sa.Column("floor_was_applied", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_goals_user_id"), "goals", ["user_id"], unique=False)
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("unit_preference", sa.String(length=10), server_default="metric", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.add_column("users", sa.Column("token_hash", sa.String(length=64), nullable=False))
    op.add_column("users", sa.Column("name", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("sex", sa.String(length=10), nullable=True))
    op.add_column("users", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("height_cm", sa.Double(), nullable=True))
    op.add_column("users", sa.Column("weight_kg", sa.Double(), nullable=True))
    op.add_column("users", sa.Column("goal_weight_kg", sa.Double(), nullable=True))
    op.add_column("users", sa.Column("activity_level", sa.String(length=20), nullable=True))
    op.add_column("users", sa.Column("goal_type", sa.String(length=20), nullable=True))
    op.add_column("users", sa.Column("rate_kg_per_week", sa.Double(), nullable=True))
    op.add_column("users", sa.Column("timezone", sa.String(length=64), nullable=True))
    op.add_column(
        "users", sa.Column("profile_updated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(op.f("ix_users_token_hash"), "users", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_token_hash"), table_name="users")
    op.drop_column("users", "profile_updated_at")
    op.drop_column("users", "timezone")
    op.drop_column("users", "rate_kg_per_week")
    op.drop_column("users", "goal_type")
    op.drop_column("users", "activity_level")
    op.drop_column("users", "goal_weight_kg")
    op.drop_column("users", "weight_kg")
    op.drop_column("users", "height_cm")
    op.drop_column("users", "birth_date")
    op.drop_column("users", "sex")
    op.drop_column("users", "name")
    op.drop_column("users", "token_hash")
    op.drop_table("user_settings")
    op.drop_index(op.f("ix_goals_user_id"), table_name="goals")
    op.drop_table("goals")
