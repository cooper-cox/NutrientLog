from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.calc.calorie_target import ActivityLevel, GoalType, Sex
from app.calc.dates import is_valid_timezone


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
