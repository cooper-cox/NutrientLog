"""Nutrient math. Foods store nutrients per 100 g; a log entry eats some number of grams.

"Unknown is not zero": a missing value is None and stays None. It is never treated as 0, because
that would claim a food has none of a nutrient when we simply don't know.
"""

from collections.abc import Iterable, Mapping

# Keys are nutrient names (e.g. "calories", "protein_g"); values are amounts, or None if unknown.
NutrientAmounts = Mapping[str, float | None]


def scale_nutrient(amount_per_100g: float | None, grams: float) -> float | None:
    """Amount of a nutrient in `grams` of a food, given the amount per 100 g."""
    if grams < 0:
        raise ValueError("grams cannot be negative")
    if amount_per_100g is None:
        return None
    return amount_per_100g * grams / 100


def scale_nutrients(per_100g: NutrientAmounts, grams: float) -> dict[str, float | None]:
    """Scale every nutrient of a food to the amount eaten. Unknown values stay unknown."""
    return {name: scale_nutrient(value, grams) for name, value in per_100g.items()}


def sum_nutrients(items: Iterable[NutrientAmounts]) -> dict[str, float | None]:
    """Add up nutrients across several foods (e.g. everything eaten today).

    For each nutrient, the total is the sum of the values we know. If no item has a known value,
    the total stays None. A total can therefore be a lower bound when some foods lack the data.
    """
    totals: dict[str, float | None] = {}
    for item in items:
        for name, value in item.items():
            current = totals.get(name)
            if value is None:
                totals.setdefault(name, None)
            else:
                totals[name] = value if current is None else current + value
    return totals
