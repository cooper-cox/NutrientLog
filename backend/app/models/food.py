import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Identity, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


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
