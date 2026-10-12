"""Daily calorie target from a person's body, activity level, and weight goal.

Method:
  1. BMR (calories burned at rest) from the Mifflin-St Jeor equation.
  2. Multiply by an activity factor to estimate maintenance calories (TDEE).
  3. Add (gain) or subtract (lose) calories to hit the requested weekly rate of change.
  4. Apply safety limits: a cap on the weekly rate and a minimum daily calorie floor.

All of the numbers below are estimates and defaults. Real bodies vary, which is why the app
later compares this target against the actual weight trend. This is not medical advice.
"""

from dataclasses import dataclass
from enum import StrEnum

from app.calc.units import Units, format_height_limit, format_weight_limit


class Sex(StrEnum):
    MALE = "male"
    FEMALE = "female"
    # "Prefer not to say". The formula uses the average of the male and female versions.
    NO_ANSWER = "no_answer"


class ActivityLevel(StrEnum):
    SEDENTARY = "sedentary"  # little or no exercise
    LIGHT = "light"  # 1-3 workouts a week
    MODERATE = "moderate"  # 3-5 workouts a week
    VERY_ACTIVE = "very_active"  # 6-7 workouts a week
    EXTRA_ACTIVE = "extra_active"  # hard daily training or a physical job


class GoalType(StrEnum):
    GAIN = "gain"
    LOSE = "lose"
    MAINTAIN = "maintain"


ACTIVITY_MULTIPLIERS: dict[ActivityLevel, float] = {
    ActivityLevel.SEDENTARY: 1.2,
    ActivityLevel.LIGHT: 1.375,
    ActivityLevel.MODERATE: 1.55,
    ActivityLevel.VERY_ACTIVE: 1.725,
    ActivityLevel.EXTRA_ACTIVE: 1.9,
}

# About 7,700 kcal is stored in 1 kg of body weight change. A common rule of thumb, not exact.
KCAL_PER_KG_BODY_WEIGHT = 7700

# Safety limits (easy to tune in one place).
MAX_GAIN_KG_PER_WEEK = 0.5
MAX_LOSE_KG_PER_WEEK = 1.0
CALORIE_FLOOR: dict[Sex, int] = {Sex.MALE: 1500, Sex.FEMALE: 1200, Sex.NO_ANSWER: 1350}

# The constant added in the Mifflin-St Jeor equation. "No answer" is the average of the two.
BMR_SEX_CONSTANT: dict[Sex, int] = {Sex.MALE: 5, Sex.FEMALE: -161, Sex.NO_ANSWER: -78}

# Accepted input ranges. Anything outside is rejected rather than guessed at.
# Under-18 targets need different handling, so they are not supported.
MIN_AGE_YEARS, MAX_AGE_YEARS = 18, 100
MIN_HEIGHT_CM, MAX_HEIGHT_CM = 100.0, 250.0
MIN_WEIGHT_KG, MAX_WEIGHT_KG = 30.0, 300.0


@dataclass(frozen=True)
class Problem:
    """One survey answer that can't be accepted: which answer, and what to tell the person."""

    field: str
    message: str


class InvalidInputError(ValueError):
    """One or more answers can't be accepted. Every problem is reported, not just the first."""

    def __init__(self, problems: list[Problem]) -> None:
        super().__init__(" ".join(problem.message for problem in problems))
        self.problems = problems

    @property
    def field(self) -> str:
        """The field of the first problem (handy when there is only one)."""
        return self.problems[0].field

    @property
    def message(self) -> str:
        return self.problems[0].message


@dataclass(frozen=True)
class CalorieTarget:
    calories: int  # the daily target to show the user
    bmr: float  # calories burned at rest
    tdee: float  # estimated maintenance calories
    daily_adjustment: float  # calories added (+) or removed (-) for the goal
    rate_kg_per_week: float  # the weekly rate actually used, after any cap
    rate_was_capped: bool  # True if the requested rate was too extreme and was reduced
    floor_was_applied: bool  # True if the result was raised to the minimum daily calories


def bmr_mifflin_st_jeor(weight_kg: float, height_cm: float, age_years: int, sex: Sex) -> float:
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age_years
    return base + BMR_SEX_CONSTANT[sex]


def tdee(bmr: float, activity: ActivityLevel) -> float:
    return bmr * ACTIVITY_MULTIPLIERS[activity]


def daily_adjustment_kcal(goal: GoalType, rate_kg_per_week: float) -> float:
    """Calories per day to add (positive) or remove (negative) for a weekly rate of change."""
    per_day = rate_kg_per_week * KCAL_PER_KG_BODY_WEIGHT / 7
    if goal is GoalType.GAIN:
        return per_day
    if goal is GoalType.LOSE:
        return -per_day
    return 0.0


def range_problems(
    age_years: int,
    height_cm: float,
    weight_kg: float,
    rate_kg_per_week: float,
    units: Units = "metric",
) -> list[Problem]:
    """Every answer that is outside the accepted range, worded in the person's units."""
    problems: list[Problem] = []
    if age_years < MIN_AGE_YEARS:
        problems.append(
            Problem(
                "birth_date", f"NutrientLog is for adults: you must be {MIN_AGE_YEARS} or older."
            )
        )
    elif age_years > MAX_AGE_YEARS:
        problems.append(
            Problem(
                "birth_date",
                f"Please check your birth date: we support ages up to {MAX_AGE_YEARS}.",
            )
        )
    if not MIN_HEIGHT_CM <= height_cm <= MAX_HEIGHT_CM:
        low = format_height_limit(MIN_HEIGHT_CM, units, round_up=True)
        high = format_height_limit(MAX_HEIGHT_CM, units, round_up=False)
        problems.append(Problem("height_cm", f"Height must be between {low} and {high}."))
    if not MIN_WEIGHT_KG <= weight_kg <= MAX_WEIGHT_KG:
        problems.append(Problem("weight_kg", f"Weight must be between {weight_range_text(units)}."))
    if rate_kg_per_week < 0:
        problems.append(Problem("rate_kg_per_week", "The weekly pace cannot be negative."))
    return problems


def weight_range_text(units: Units) -> str:
    low = format_weight_limit(MIN_WEIGHT_KG, units, round_up=True)
    high = format_weight_limit(MAX_WEIGHT_KG, units, round_up=False)
    return f"{low} and {high}"


def calculate_calorie_target(
    *,
    sex: Sex,
    age_years: int,
    height_cm: float,
    weight_kg: float,
    activity: ActivityLevel,
    goal: GoalType,
    rate_kg_per_week: float = 0.0,
) -> CalorieTarget:
    problems = range_problems(age_years, height_cm, weight_kg, rate_kg_per_week)
    if problems:
        raise InvalidInputError(problems)

    bmr = bmr_mifflin_st_jeor(weight_kg, height_cm, age_years, sex)
    maintenance = tdee(bmr, activity)

    max_rate = {
        GoalType.GAIN: MAX_GAIN_KG_PER_WEEK,
        GoalType.LOSE: MAX_LOSE_KG_PER_WEEK,
        GoalType.MAINTAIN: 0.0,
    }[goal]
    rate = min(rate_kg_per_week, max_rate)
    rate_was_capped = goal is not GoalType.MAINTAIN and rate < rate_kg_per_week

    adjustment = daily_adjustment_kcal(goal, rate)
    raw_target = maintenance + adjustment

    floor = CALORIE_FLOOR[sex]
    floor_was_applied = raw_target < floor
    calories = round(max(raw_target, floor))

    return CalorieTarget(
        calories=calories,
        bmr=bmr,
        tdee=maintenance,
        daily_adjustment=adjustment,
        rate_kg_per_week=rate,
        rate_was_capped=rate_was_capped,
        floor_was_applied=floor_was_applied,
    )
