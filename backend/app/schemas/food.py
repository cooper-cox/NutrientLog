import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ServingIn(BaseModel):
    label: str
    grams: float


class ServingOut(BaseModel):
    label: str
    grams: float


class FoodIn(BaseModel):
    """A food to save. Nutrients are per 100 g; leave one out (or null) if it is not known."""

    name: str = Field(default="")
    brand: str | None = None
    barcode: str | None = Field(default=None, max_length=32)
    nutrients: dict[str, float | None] = Field(default_factory=dict)
    servings: list[ServingIn] = Field(default_factory=list)
    # "usda" when saving a search result (source_id is then USDA's id).
    source: Literal["manual", "usda"] = "manual"
    source_id: str | None = Field(default=None, max_length=64)


class FoodOut(BaseModel):
    id: uuid.UUID
    name: str
    brand: str | None
    barcode: str | None
    source: str
    source_id: str | None
    is_estimated: bool
    kind: str
    # Every nutrient we track; null means unknown (not zero).
    nutrients: dict[str, float | None]
    servings: list[ServingOut]
    created_at: datetime


class FoodCandidateOut(BaseModel):
    """A search result from an outside database, not saved yet. Save it with POST /foods."""

    source: str
    source_id: str
    name: str
    brand: str | None
    barcode: str | None
    nutrients: dict[str, float | None]
    servings: list[ServingOut]


class FoodSearchOut(BaseModel):
    saved: list[FoodOut]
    # More foods from USDA, minus any already saved. Empty if the lookup is off or failed.
    usda: list[FoodCandidateOut]
    usda_available: bool
    # True if asking for the next page (page=2, ...) may find more USDA foods.
    usda_has_more: bool = False
    # A plain sentence if the USDA lookup failed (the saved results are still good).
    usda_message: str | None = None
