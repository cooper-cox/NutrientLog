"""What the API accepts and returns (request and response shapes)."""

import uuid
from datetime import date, datetime
from datetime import date as datetime_date
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.calc.dates import is_valid_timezone
from app.calc.goals import ActivityLevel, GoalType, Sex


class UserCreated(BaseModel):
    user_id: uuid.UUID
    # Shown only once. The app must store it and send it as "Authorization: Bearer <token>".
    token: str


class UnitPreference(StrEnum):
    METRIC = "metric"
    IMPERIAL = "imperial"


class ProfileIn(BaseModel):
    """The onboarding survey. Everything is metric: the phone converts if the user prefers lb/ft."""

    name: str | None = Field(default=None, max_length=100)
    sex: Sex
    birth_date: date
    height_cm: float = Field(gt=0)
    weight_kg: float = Field(gt=0)
    goal_weight_kg: float | None = Field(default=None, gt=0)
    activity_level: ActivityLevel
    goal_type: GoalType
    rate_kg_per_week: float = Field(default=0.0, ge=0)
    timezone: str
    unit_preference: UnitPreference = UnitPreference.METRIC

    @field_validator("name")
    @classmethod
    def _blank_name_is_no_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("timezone")
    @classmethod
    def _timezone_must_exist(cls, value: str) -> str:
        if not is_valid_timezone(value):
            raise ValueError("unknown timezone; use a name like America/Los_Angeles")
        return value


class ProfileOut(BaseModel):
    name: str | None
    sex: Sex
    birth_date: date
    height_cm: float
    weight_kg: float
    goal_weight_kg: float | None
    activity_level: ActivityLevel
    goal_type: GoalType
    rate_kg_per_week: float
    timezone: str
    unit_preference: UnitPreference
    updated_at: datetime


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    effective_from: date
    calories: int
    protein_g: int
    fat_g: int
    carb_g: int
    # How the calorie target was reached, so the app can explain it.
    weight_kg: float
    bmr: float
    tdee: float
    daily_adjustment: float
    rate_kg_per_week: float
    rate_was_capped: bool
    floor_was_applied: bool
    # About how many weeks until the goal weight at the weekly rate used. None if there is no
    # goal weight or no weekly rate. Filled in by `goal_out`, not stored.
    weeks_to_goal: int | None = None


class ProfileSaved(BaseModel):
    profile: ProfileOut
    goal: GoalOut


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
    # How long it took to answer, in milliseconds (for finding out what makes a search slow).
    took_ms: int | None = None


class FoodSearchOut(BaseModel):
    # The person's own saved foods that match (first page only).
    saved: list[FoodOut]
    # Foods from the outside databases, best match first, with duplicates merged. Not saved yet:
    # save one with POST /foods.
    results: list[FoodCandidateOut]
    sources: list[SourceStatus]
    # True if asking for the next `page` may find more results.
    has_more: bool = False
    # True when a "fast" search left out the slower fallback database that a full search would
    # add: ask again without `scope=fast` to get those results too.
    more_coming: bool = False


class LimitsOut(BaseModel):
    min_age_years: int
    max_age_years: int
    min_height_cm: float
    max_height_cm: float
    min_weight_kg: float
    max_weight_kg: float
    # Height and weight that can't both be right.
    min_plausible_bmi: float
    max_plausible_bmi: float
    # Goal weights: the lowest allowed when losing weight, and the highest allowed when gaining.
    min_goal_bmi_when_losing: float
    max_goal_bmi: float
    max_gain_kg_per_week: float
    max_lose_kg_per_week: float


class HealthResponse(BaseModel):
    status: str


class DatabaseHealthResponse(BaseModel):
    status: str
    database: str


class MeasuresOut(BaseModel):
    """A food's household measures from its database, ready to save with the food."""

    servings: list[ServingIn]


class AmountIn(BaseModel):
    """What was typed ("1/2 cup flour") and what is known about the food, to turn into grams."""

    text: str = Field(min_length=1, max_length=100)
    food_name: str = Field(default="", max_length=200)
    servings: list[ServingIn] = Field(default_factory=list, max_length=50)


class PortionsIn(BaseModel):
    food_name: str = Field(default="", max_length=200)
    servings: list[ServingIn] = Field(default_factory=list, max_length=50)


class PortionOut(BaseModel):
    """One choice on the amount wheel: `grams` is the weight of ONE of it."""

    label: str
    grams: float
    kind: Literal["own", "rough", "exact"]
    note: str  # for rough sizes: "about 6 oz (170 g)"
    quantities: list[float]


class PortionsOut(BaseModel):
    portions: list[PortionOut]


class AmountOut(BaseModel):
    grams: float
    quantity: float
    unit: str | None


class LogEntryIn(BaseModel):
    """Something eaten: a saved food and an amount in grams (the app works the grams out)."""

    food_id: uuid.UUID
    grams: float = Field(gt=0)
    amount_text: str | None = Field(default=None, max_length=100)
    # Leave out for "today, where the person is".
    logged_on: date | None = None


class LogEntryOut(BaseModel):
    id: uuid.UUID
    food_id: uuid.UUID
    food_name: str
    brand: str | None
    logged_on: date
    grams: float
    amount_text: str | None
    # What this amount contains; null = unknown for that nutrient.
    nutrients: dict[str, float | None]
    created_at: datetime


class LogEntryPatch(BaseModel):
    """Change an entry's amount: type a new amount ("2 slices"), or send grams directly."""

    amount_text: str | None = Field(default=None, min_length=1, max_length=100)
    grams: float | None = Field(default=None, gt=0)


class WeekDayOut(BaseModel):
    date: date
    calories: float
    protein_g: float
    entries: int


class WeekOut(BaseModel):
    """Seven days ending on `end`, oldest first, for the weekly view."""

    end: date
    days: list[WeekDayOut]
    goal_calories: int | None
    # Average calories over the days that have anything logged; null if none do.
    average_calories: float | None


class MonthOut(BaseModel):
    """Every day of one calendar month, for the calendar view."""

    month: str  # "2026-10"
    today: datetime_date
    days: list[WeekDayOut]
    goal_calories: int | None
    average_calories: float | None


class DayOut(BaseModel):
    """Everything eaten on one day, the totals, and how that compares with the calorie target."""

    date: date
    # The person's own "today", so the phone knows whether this is today without guessing.
    today: datetime_date
    entries: list[LogEntryOut]
    totals: dict[str, float | None]
    goal_calories: int | None
    # Goal minus eaten; negative means over. Null until a goal exists.
    remaining_calories: float | None
