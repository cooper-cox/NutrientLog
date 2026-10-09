import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class User(Base):
    """An anonymous user, identified by a secret token (only its hash is stored).

    The profile columns stay empty until the user finishes onboarding. `profile_updated_at` is
    None until then, which is how the app knows to show the survey.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    # Profile (from the onboarding survey)
    name: Mapped[str | None] = mapped_column(String(100))
    sex: Mapped[str | None] = mapped_column(String(10))
    birth_date: Mapped[date | None] = mapped_column(Date)
    height_cm: Mapped[float | None]
    # Weight at the last profile save. Replaced by the weight log in a later version.
    weight_kg: Mapped[float | None]
    goal_weight_kg: Mapped[float | None]
    activity_level: Mapped[str | None] = mapped_column(String(20))
    goal_type: Mapped[str | None] = mapped_column(String(20))
    # The rate the user asked for. The rate actually used (after safety caps) is stored on the goal.
    rate_kg_per_week: Mapped[float | None]
    timezone: Mapped[str | None] = mapped_column(String(64))
    profile_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    settings: Mapped["UserSettings"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )


class UserSettings(Base):
    """Per-user preferences. More settings (theme, notifications, ...) arrive in later versions."""

    __tablename__ = "user_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    unit_preference: Mapped[str] = mapped_column(
        String(10), default="metric", server_default="metric"
    )

    user: Mapped[User] = relationship(back_populates="settings")
