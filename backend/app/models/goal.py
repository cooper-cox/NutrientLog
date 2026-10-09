import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Goal(Base):
    """A calorie and macro target. Never edited: saving the profile adds a new row.

    Keeping every goal gives the user a history, and keeps past days judged against the target
    that was actually in effect. The inputs and intermediate numbers are stored too, so the app
    can later explain *why* the target is what it is.
    """

    __tablename__ = "goals"

    # An ever-increasing number, used to break ties when several goals start on the same date.
    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    effective_from: Mapped[date]

    # The targets
    calories: Mapped[int]
    protein_g: Mapped[int]
    fat_g: Mapped[int]
    carb_g: Mapped[int]

    # How the calorie target was reached
    weight_kg: Mapped[float]
    bmr: Mapped[float]
    tdee: Mapped[float]
    daily_adjustment: Mapped[float]
    rate_kg_per_week: Mapped[float]
    rate_was_capped: Mapped[bool]
    floor_was_applied: Mapped[bool]
