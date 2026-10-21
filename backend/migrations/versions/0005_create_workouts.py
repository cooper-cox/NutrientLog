"""create workouts

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workouts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("logged_on", sa.Date(), nullable=False),
        sa.Column("activity", sa.String(length=20), nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=False),
        sa.Column("intensity", sa.String(length=10), nullable=False),
        sa.Column("calories", sa.Float(), nullable=False),
        sa.Column("calories_typed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_workouts_user_id"), "workouts", ["user_id"], unique=False)
    op.create_index(op.f("ix_workouts_logged_on"), "workouts", ["logged_on"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_workouts_logged_on"), table_name="workouts")
    op.drop_index(op.f("ix_workouts_user_id"), table_name="workouts")
    op.drop_table("workouts")
