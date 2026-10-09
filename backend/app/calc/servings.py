"""Turn "what the user ate" into grams, the one unit the rest of the app works in.

A food has named servings ("1 slice = 28 g", "1 bar = 68 g"). A log entry can then be entered as
grams, ounces, or a number of servings, and always ends up stored as grams.
"""

from typing import Literal

from app.calc.units import oz_to_g

AmountUnit = Literal["g", "oz", "serving"]


def amount_to_grams(
    amount: float,
    unit: AmountUnit,
    grams_per_serving: float | None = None,
) -> float:
    """Convert an amount in grams, ounces, or servings to grams.

    `grams_per_serving` is required when `unit` is "serving" (e.g. 28 for "1 slice = 28 g").
    """
    if amount <= 0:
        raise ValueError("amount must be greater than zero")

    if unit == "g":
        return amount
    if unit == "oz":
        return oz_to_g(amount)
    if unit == "serving":
        if grams_per_serving is None or grams_per_serving <= 0:
            raise ValueError("grams_per_serving must be a positive number for serving amounts")
        return amount * grams_per_serving
    raise ValueError(f"unknown unit: {unit}")
