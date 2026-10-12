"""Unit conversion. The app stores everything in metric (kg, cm, g) and converts at the edges."""

import math
from typing import Literal

Units = Literal["metric", "imperial"]

KG_PER_LB = 0.45359237
CM_PER_INCH = 2.54
G_PER_OZ = 28.349523125
INCHES_PER_FOOT = 12


def kg_to_lb(kg: float) -> float:
    return kg / KG_PER_LB


def lb_to_kg(lb: float) -> float:
    return lb * KG_PER_LB


def cm_to_inches(cm: float) -> float:
    return cm / CM_PER_INCH


def inches_to_cm(inches: float) -> float:
    return inches * CM_PER_INCH


def feet_inches_to_cm(feet: float, inches: float = 0.0) -> float:
    return inches_to_cm(feet * INCHES_PER_FOOT + inches)


def cm_to_feet_inches(cm: float) -> tuple[int, float]:
    """Return (feet, inches), with inches rounded to one decimal.

    Rounding can land on 12.0 inches (e.g. 5 ft 11.96 in), which is carried over to the next foot.
    """
    total_inches = round(cm_to_inches(cm), 1)
    feet = int(total_inches // INCHES_PER_FOOT)
    inches = round(total_inches - feet * INCHES_PER_FOOT, 1)
    if inches >= INCHES_PER_FOOT:
        feet += 1
        inches = 0.0
    return feet, inches


def g_to_oz(grams: float) -> float:
    return grams / G_PER_OZ


def oz_to_g(oz: float) -> float:
    return oz * G_PER_OZ


def format_weight_limit(kg: float, units: Units, *, round_up: bool) -> str:
    """A weight as text in the person's units, rounded so the stated limit is never too generous.

    Lower limits round up and upper limits round down, so a person who types exactly the number
    shown is always accepted.
    """
    value = kg if units == "metric" else kg_to_lb(kg)
    whole = math.ceil(value - 1e-9) if round_up else math.floor(value + 1e-9)
    return f"{whole} kg" if units == "metric" else f"{whole} lb"


def format_height_limit(cm: float, units: Units, *, round_up: bool) -> str:
    """A height as text in the person's units (cm, or feet and whole inches), rounded as above."""
    if units == "metric":
        whole = math.ceil(cm - 1e-9) if round_up else math.floor(cm + 1e-9)
        return f"{whole} cm"
    inches = cm_to_inches(cm)
    total = math.ceil(inches - 1e-9) if round_up else math.floor(inches + 1e-9)
    feet, rest = divmod(total, INCHES_PER_FOOT)
    return f"{feet} ft {rest} in"
