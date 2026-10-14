"""create foods, food_nutrients, food_servings

Nutrient values are rows (food, key, amount) rather than columns, so new nutrients need no
migration. A nutrient with no row is unknown, which is different from zero.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "foods",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("brand", sa.String(length=100), nullable=True),
        sa.Column("barcode", sa.String(length=32), nullable=True),
        sa.Column("source", sa.String(length=20), server_default="manual", nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=True),
        sa.Column("is_estimated", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("kind", sa.String(length=10), server_default="food", nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_foods_owner_user_id"), "foods", ["owner_user_id"], unique=False)
    op.create_index(op.f("ix_foods_barcode"), "foods", ["barcode"], unique=False)
    op.create_table(
        "food_nutrients",
        sa.Column("food_id", sa.Uuid(), nullable=False),
        sa.Column("nutrient_key", sa.String(length=40), nullable=False),
        sa.Column("amount_per_100g", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["food_id"], ["foods.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("food_id", "nutrient_key"),
    )
    op.create_table(
        "food_servings",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("food_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=60), nullable=False),
        sa.Column("grams", sa.Float(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["food_id"], ["foods.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_food_servings_food_id"), "food_servings", ["food_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_food_servings_food_id"), table_name="food_servings")
    op.drop_table("food_servings")
    op.drop_table("food_nutrients")
    op.drop_index(op.f("ix_foods_barcode"), table_name="foods")
    op.drop_index(op.f("ix_foods_owner_user_id"), table_name="foods")
    op.drop_table("foods")
