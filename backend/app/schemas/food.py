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
    # What this serving contains (the food's per-100 g values scaled to `grams`); null = unknown.
    nutrients: dict[str, float | None] = Field(default_factory=dict)


class FoodIn(BaseModel):
    """A food to save. Nutrients are per 100 g; leave one out (or null) if it is not known."""

    name: str = Field(default="")
    brand: str | None = None
    barcode: str | None = Field(default=None, max_length=32)
    nutrients: dict[str, float | None] = Field(default_factory=dict)
    servings: list[ServingIn] = Field(default_factory=list)
    # "usda" or "off" (Open Food Facts) when saving a search result; source_id is then its id.
    source: Literal["manual", "usda", "off"] = "manual"
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


class SourceStatus(BaseModel):
    """How one outside food database did for this search."""

    name: str
    available: bool
    # A plain sentence if it failed (the other results are still good).
    message: str | None = None


class FoodSearchOut(BaseModel):
    # The person's own saved foods that match (first page only).
    saved: list[FoodOut]
    # Foods from the outside databases, best match first, with duplicates merged. Not saved yet:
    # save one with POST /foods.
    results: list[FoodCandidateOut]
    sources: list[SourceStatus]
    # True if asking for the next `page` may find more results.
    has_more: bool = False
