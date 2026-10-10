"""Checks and estimates that relate a weight goal to the person's current weight."""

import math

from app.calc.calorie_target import GoalType, InvalidInputError


def check_goal_weight(goal: GoalType, weight_kg: float, goal_weight_kg: float | None) -> None:
    """Reject a goal weight that points the wrong way (e.g. "gain" to a lower weight).

    A goal weight is optional, and "maintain" accepts any value, so nothing is checked there.
    """
    if goal_weight_kg is None:
        return
    if goal is GoalType.GAIN and goal_weight_kg <= weight_kg:
        raise InvalidInputError(
            "goal_weight_kg", "to gain weight, the goal weight must be above your current weight"
        )
    if goal is GoalType.LOSE and goal_weight_kg >= weight_kg:
        raise InvalidInputError(
            "goal_weight_kg", "to lose weight, the goal weight must be below your current weight"
        )


def weeks_to_goal(
    weight_kg: float, goal_weight_kg: float | None, rate_kg_per_week: float
) -> int | None:
    """About how many weeks until the goal weight, rounded up. None if it can't be estimated."""
    if goal_weight_kg is None or rate_kg_per_week <= 0:
        return None
    gap = goal_weight_kg - weight_kg
    if gap == 0:
        return 0
    return math.ceil(abs(gap) / rate_kg_per_week)
