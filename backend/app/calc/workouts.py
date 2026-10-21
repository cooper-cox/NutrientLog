"""Calories burned by a workout, estimated from the activity, its length and body weight.

calories = (MET - 1) x weight (kg) x hours x intensity factor

MET says how hard an activity is compared with sitting still (walking is about 3.5, running about
10). The "- 1" removes the resting burn, because the app counts resting burn separately and would
otherwise count it twice. The activity list and factors live in config.toml.
"""

from typing import Literal

Intensity = Literal["light", "moderate", "hard"]


def workout_calories(
    met: float, weight_kg: float, minutes: float, intensity_factor: float
) -> float:
    """Calories above resting burned by `minutes` of an activity. Raises on non-positive inputs."""
    if met <= 1 or weight_kg <= 0 or minutes <= 0 or intensity_factor <= 0:
        raise ValueError("met must be above 1, and weight, minutes and intensity above 0")
    return (met - 1) * weight_kg * (minutes / 60) * intensity_factor
