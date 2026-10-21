"""All settings, loaded once: secrets from the environment (.env), tunable numbers from config.toml.

`database_url` has no default on purpose: a committed default password would be a public password.
The phone never reads config.toml; anything it needs comes from the API (see /api/v1/limits).
"""

import os
import tomllib
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class _Section(BaseModel):
    # An unknown name in config.toml is a typo, so it is an error rather than silently ignored.
    model_config = ConfigDict(frozen=True, extra="forbid")


class Ranking(_Section):
    coverage: float = Field(ge=0, le=1000)
    all_found: float = Field(ge=0, le=1000)
    name_only: float = Field(ge=0, le=1000)
    brand_and_name: float = Field(ge=0, le=1000)
    exact_name: float = Field(ge=0, le=1000)
    plural_head: float = Field(ge=0, le=1000)
    starts_with: float = Field(ge=0, le=1000)
    generic_food: float = Field(ge=0, le=1000)
    plain_word: float = Field(ge=0, le=1000)
    extra_word: float = Field(ge=0, le=100)
    extra_cap: float = Field(ge=0, le=1000)
    energy_mismatch: float = Field(ge=0, le=1000)
    has_serving: float = Field(ge=0, le=1000)
    source_order: float = Field(ge=0, le=1000)
    close_word: float = Field(ge=0, le=1)
    plural_only: float = Field(ge=0, le=1)
    typo_word: float = Field(ge=0, le=1)


class Search(_Section):
    saved_limit: int = Field(ge=1, le=100)
    source_limit: int = Field(ge=1, le=200)
    enough_full_matches: int = Field(ge=1, le=100)
    long_query_words: int = Field(ge=2, le=10)
    min_query_length: int = Field(ge=1, le=10)
    max_query_length: int = Field(ge=20, le=500)
    timeout_seconds: float = Field(gt=0, le=60)
    deadline_seconds: float = Field(gt=0, le=60)
    cache_seconds: float = Field(ge=0, le=86400)
    usda_generic_limit: int = Field(ge=1, le=200)
    usda_loose_below: int = Field(ge=1, le=200)
    usda_retry_waits: tuple[float, ...] = Field(max_length=5)
    off_retry_waits: tuple[float, ...] = Field(max_length=5)
    off_cooldown_seconds: float = Field(ge=0, le=3600)

    @model_validator(mode="after")
    def _waits_are_sensible(self) -> "Search":
        for wait in (*self.usda_retry_waits, *self.off_retry_waits):
            if not 0 <= wait <= 30:
                raise ValueError("a retry wait must be between 0 and 30 seconds")
        return self


class FoodLimits(_Section):
    max_name_length: int = Field(ge=20, le=1000)
    max_brand_length: int = Field(ge=20, le=1000)
    max_servings: int = Field(ge=1, le=100)
    max_serving_grams: float = Field(gt=0, le=100000)
    max_serving_label_length: int = Field(ge=10, le=500)


class Portions(_Section):
    small_bowl_cups: float = Field(gt=0, le=10)
    medium_bowl_cups: float = Field(gt=0, le=10)
    large_bowl_cups: float = Field(gt=0, le=10)
    small_plate_cups: float = Field(gt=0, le=20)
    medium_plate_cups: float = Field(gt=0, le=20)
    large_plate_cups: float = Field(gt=0, le=20)
    small_portion_factor: float = Field(gt=0, lt=1)
    large_portion_factor: float = Field(gt=1, le=5)

    @model_validator(mode="after")
    def _sizes_are_in_order(self) -> "Portions":
        if not self.small_bowl_cups < self.medium_bowl_cups < self.large_bowl_cups:
            raise ValueError("bowl sizes must go small < medium < large")
        if not self.small_plate_cups < self.medium_plate_cups < self.large_plate_cups:
            raise ValueError("plate sizes must go small < medium < large")
        return self


class WorkoutActivity(_Section):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{1,19}$")
    label: str = Field(min_length=2, max_length=40)
    short: str = Field(min_length=2, max_length=6)
    met: float = Field(gt=1.0, le=25)


class Workouts(_Section):
    intensity_light: float = Field(gt=0, lt=1)
    intensity_moderate: float = Field(gt=0, le=2)
    intensity_hard: float = Field(gt=1, le=2)
    max_minutes: int = Field(ge=30, le=1440)
    max_calories: float = Field(gt=0, le=20000)
    activities: list[WorkoutActivity] = Field(min_length=1)

    @model_validator(mode="after")
    def _keys_are_unique(self) -> "Workouts":
        keys = [activity.key for activity in self.activities]
        if len(keys) != len(set(keys)):
            raise ValueError("workout activity keys must be unique")
        return self


class Activity(_Section):
    sedentary: float = Field(ge=1.0, le=2.5)
    light: float = Field(ge=1.0, le=2.5)
    moderate: float = Field(ge=1.0, le=2.5)
    very_active: float = Field(ge=1.0, le=2.5)
    extra_active: float = Field(ge=1.0, le=2.5)


class CalorieFloor(_Section):
    male: int = Field(ge=1000, le=2500)
    female: int = Field(ge=1000, le=2500)
    no_answer: int = Field(ge=1000, le=2500)


class Goals(_Section):
    max_gain_kg_per_week: float = Field(gt=0, le=1.0)
    max_lose_kg_per_week: float = Field(gt=0, le=1.5)
    protein_g_per_kg: float = Field(gt=0, le=4.0)
    max_protein_fraction: float = Field(gt=0, le=0.6)
    fat_fraction: float = Field(gt=0, le=0.6)
    activity: Activity
    calorie_floor: CalorieFloor


class Profile(_Section):
    min_plausible_bmi: float = Field(ge=8, le=20)
    max_plausible_bmi: float = Field(ge=40, le=120)
    min_goal_bmi_when_losing: float = Field(ge=15, le=25)
    max_goal_bmi: float = Field(ge=30, le=60)


def _find_config() -> Path:
    """config.toml next to the app folder, or CONFIG_FILE if set, or in the working directory."""
    candidates = [
        Path(path)
        for path in (
            os.environ.get("CONFIG_FILE"),
            str(Path(__file__).resolve().parent.parent / "config.toml"),
        )
        if path
    ]
    candidates.append(Path.cwd() / "config.toml")
    for path in candidates:
        if path.is_file():
            return path
    raise FileNotFoundError(
        "config.toml not found (looked in: " + ", ".join(map(str, candidates)) + ")"
    )


def load_config(path: Path | None = None) -> dict[str, object]:
    with (path or _find_config()).open("rb") as file:
        return tomllib.load(file)


class Settings(BaseSettings):
    """Secrets and per-machine values come from the environment; the rest from config.toml."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore", frozen=True)

    database_url: str  # required: set DATABASE_URL (see .env.example)
    # Free key from https://fdc.nal.usda.gov/api-key-signup. Empty turns the USDA lookup off.
    usda_api_key: str = ""
    # Open Food Facts needs no key. Set OPEN_FOOD_FACTS=false to turn it off.
    open_food_facts: bool = True
    # Only Open Food Facts products sold in this country (empty for all). Keeps out foreign-language
    # products that clutter English searches.
    open_food_facts_country: str = "united-states"

    ranking: Ranking
    search: Search
    food: FoodLimits
    portions: Portions
    workouts: Workouts
    goals: Goals
    profile: Profile


settings = Settings(**load_config())  # type: ignore[arg-type]
