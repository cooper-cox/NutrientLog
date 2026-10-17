"""Checks on the survey answers as a whole: ranges, and whether the answers make sense together.

Every problem is collected and reported at once, so a person can fix everything in one go.
Messages are worded in the units the person chose (the numbers themselves are always metric).

The body-size limits below are judgement calls, not medical facts. They exist to catch typos and
clearly unsafe goals; they should be reviewed with a professional before others use the app (L29).
"""

from app.calc.goals import (
    MAX_AGE_YEARS,
    MAX_GAIN_KG_PER_WEEK,
    MAX_HEIGHT_CM,
    MAX_LOSE_KG_PER_WEEK,
    MAX_WEIGHT_KG,
    MIN_AGE_YEARS,
    MIN_HEIGHT_CM,
    MIN_WEIGHT_KG,
    GoalType,
    Problem,
    range_problems,
    weight_range_text,
)
from app.calc.units import Units, format_weight_limit
from app.settings import settings

# Height and weight that can't both be right (a typo, or someone who needs a doctor, not an app).
MIN_PLAUSIBLE_BMI = settings.profile.min_plausible_bmi
MAX_PLAUSIBLE_BMI = settings.profile.max_plausible_bmi
# The lowest goal we'll set for someone who wants to lose weight: the bottom of the healthy range.
MIN_GOAL_BMI_WHEN_LOSING = settings.profile.min_goal_bmi_when_losing
# The highest goal weight we'll set for someone who wants to gain weight.
MAX_GOAL_BMI = settings.profile.max_goal_bmi


def bmi(weight_kg: float, height_cm: float) -> float:
    return weight_kg / (height_cm / 100) ** 2


def weight_for_bmi(target_bmi: float, height_cm: float) -> float:
    return target_bmi * (height_cm / 100) ** 2


def check_profile(
    *,
    age_years: int,
    height_cm: float,
    weight_kg: float,
    goal_weight_kg: float | None,
    goal: GoalType,
    rate_kg_per_week: float,
    units: Units,
) -> list[Problem]:
    """Every problem with the answers, or an empty list if they can all be accepted."""
    problems = range_problems(age_years, height_cm, weight_kg, rate_kg_per_week, units)
    failed = {problem.field for problem in problems}
    height_ok = MIN_HEIGHT_CM <= height_cm <= MAX_HEIGHT_CM

    if "weight_kg" not in failed and height_ok:
        current_bmi = bmi(weight_kg, height_cm)
        if not MIN_PLAUSIBLE_BMI <= current_bmi <= MAX_PLAUSIBLE_BMI:
            message = "That height and weight don't look right together. Please check them."
            if current_bmi < MIN_PLAUSIBLE_BMI:
                message += (
                    " If they are correct, please talk to a doctor before using a nutrition app."
                )
            problems.append(Problem("weight_kg", message))

    if goal_weight_kg is not None:
        problem = _goal_weight_problem(
            goal, weight_kg, goal_weight_kg, height_cm if height_ok else None, units
        )
        if problem is not None:
            problems.append(problem)
    return problems


def _goal_weight_problem(
    goal: GoalType,
    weight_kg: float,
    goal_weight_kg: float,
    height_cm: float | None,
    units: Units,
) -> Problem | None:
    field = "goal_weight_kg"
    if not MIN_WEIGHT_KG <= goal_weight_kg <= MAX_WEIGHT_KG:
        return Problem(field, f"Goal weight must be between {weight_range_text(units)}.")
    if goal is GoalType.GAIN and goal_weight_kg <= weight_kg:
        return Problem(field, "To gain weight, the goal weight must be above your current weight.")
    if goal is GoalType.LOSE and goal_weight_kg >= weight_kg:
        return Problem(field, "To lose weight, the goal weight must be below your current weight.")
    if height_cm is None:
        return None  # the height problem is reported on its own
    if goal is GoalType.LOSE:
        lowest = weight_for_bmi(MIN_GOAL_BMI_WHEN_LOSING, height_cm)
        if goal_weight_kg < lowest:
            about = format_weight_limit(lowest, units, round_up=True, step=5)
            return Problem(
                field, f"For your height, the lowest goal weight we can set is about {about}."
            )
    if goal is GoalType.GAIN:
        # Only gaining is limited at the top. Someone who already weighs more than this and
        # wants to lose weight (or stay put) must still be able to set a goal below where they are.
        highest = weight_for_bmi(MAX_GOAL_BMI, height_cm)
        if goal_weight_kg > highest:
            about = format_weight_limit(highest, units, round_up=False, step=5)
            return Problem(
                field, f"For your height, the highest goal weight we can set is about {about}."
            )
    return None


def limits() -> dict[str, float | int]:
    """The numbers above, for the app to check answers as they are typed."""
    return {
        "min_age_years": MIN_AGE_YEARS,
        "max_age_years": MAX_AGE_YEARS,
        "min_height_cm": MIN_HEIGHT_CM,
        "max_height_cm": MAX_HEIGHT_CM,
        "min_weight_kg": MIN_WEIGHT_KG,
        "max_weight_kg": MAX_WEIGHT_KG,
        "min_plausible_bmi": MIN_PLAUSIBLE_BMI,
        "max_plausible_bmi": MAX_PLAUSIBLE_BMI,
        "min_goal_bmi_when_losing": MIN_GOAL_BMI_WHEN_LOSING,
        "max_goal_bmi": MAX_GOAL_BMI,
        "max_gain_kg_per_week": MAX_GAIN_KG_PER_WEEK,
        "max_lose_kg_per_week": MAX_LOSE_KG_PER_WEEK,
    }
