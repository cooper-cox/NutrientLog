"""Estimates that relate a weight goal to the person's current weight."""

import math


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
