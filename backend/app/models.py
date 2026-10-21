"""The database tables: users, settings, goals, foods with nutrients and servings, the food log
and workouts."""

import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Float, ForeignKey, Identity, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all database tables."""


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


class Food(Base):
    """A food someone can log. Nutrients are per 100 g (see FoodNutrient); servings are named
    shortcuts for a weight ("1 bar = 68 g").

    ``owner_user_id`` is the person who saved it; NULL would mean shared with everyone (none yet).
    ``source`` says where it came from: "manual" (typed in) or "usda". ``source_id`` is the outside
    database's own id, which is how saving the same USDA food twice is noticed.
    """

    __tablename__ = "foods"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    name: Mapped[str] = mapped_column(String(200))
    brand: Mapped[str | None] = mapped_column(String(100))
    barcode: Mapped[str | None] = mapped_column(String(32), index=True)
    source: Mapped[str] = mapped_column(String(20), default="manual", server_default="manual")
    source_id: Mapped[str | None] = mapped_column(String(64))
    # True for AI guesses (a later version); the app labels these "estimated".
    is_estimated: Mapped[bool] = mapped_column(default=False, server_default="false")
    # "food" now; "recipe" (a food built from other foods) arrives in a later version.
    kind: Mapped[str] = mapped_column(String(10), default="food", server_default="food")

    nutrients: Mapped[list["FoodNutrient"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    servings: Mapped[list["FoodServing"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="FoodServing.position"
    )


class FoodNutrient(Base):
    """One known nutrient of one food, per 100 g. A nutrient with no row is *unknown* (not zero)."""

    __tablename__ = "food_nutrients"

    food_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("foods.id", ondelete="CASCADE"), primary_key=True
    )
    # A key from app/calc/nutrient_catalog.py, e.g. "protein_g".
    nutrient_key: Mapped[str] = mapped_column(String(40), primary_key=True)
    amount_per_100g: Mapped[float] = mapped_column(Float)


class FoodServing(Base):
    __tablename__ = "food_servings"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    food_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("foods.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(60))
    grams: Mapped[float] = mapped_column(Float)
    position: Mapped[int] = mapped_column(default=0)


class LogEntry(Base):
    """One thing someone ate: a food, an amount in grams, on a calendar day.

    `logged_on` is the person's own local date when they logged it (not UTC), so "today" matches
    what they see on their phone. `amount_text` is what they typed ("1/2 cup"), shown back to
    them; the grams are what counts. Nutrients are worked out from the food when read.
    """

    __tablename__ = "log_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    food_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("foods.id", ondelete="RESTRICT"))
    logged_on: Mapped[date] = mapped_column(Date, index=True)
    grams: Mapped[float]
    amount_text: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    food: Mapped[Food] = relationship(lazy="joined")


class Workout(Base):
    """One workout on a calendar day. `calories` is what counts: either typed by the person
    (`calories_typed`) or estimated from the activity, minutes, intensity and their weight."""

    __tablename__ = "workouts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    logged_on: Mapped[date] = mapped_column(Date, index=True)
    activity: Mapped[str] = mapped_column(String(20))
    minutes: Mapped[int]
    intensity: Mapped[str] = mapped_column(String(10))
    calories: Mapped[float]
    calories_typed: Mapped[bool] = mapped_column(default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
