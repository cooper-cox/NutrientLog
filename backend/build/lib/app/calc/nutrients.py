"""The nutrients the app knows about, and the math on them (scaling, adding up).

Foods store each nutrient per 100 g under a short key (``protein_g``). Adding a nutrient later
means adding one line to the catalog: no database change is needed, because nutrient values are
stored as rows of (food, key, amount), not as one column per nutrient.

"Unknown is not zero": a missing value is None and stays None, never 0.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Literal

Unit = Literal["kcal", "g", "mg", "ug"]
Category = Literal["energy", "macro", "mineral", "vitamin", "other"]


@dataclass(frozen=True)
class Nutrient:
    key: str
    name: str
    unit: Unit
    category: Category
    usda_numbers: tuple[str, ...]


# Nothing in 100 g of food can weigh more than 100 g, and pure fat is about 900 kcal. The mg and
# ug ceilings are deliberately loose: they only exist to catch typos like an extra zero.
MAX_PER_100G: dict[Unit, float] = {"kcal": 900.0, "g": 100.0, "mg": 40_000.0, "ug": 100_000.0}

# Energy has three USDA numbers: 208 (label energy), then 957/958 (calculated), which is all some
# generic foods have.
CATALOG: tuple[Nutrient, ...] = (
    Nutrient("calories", "Calories", "kcal", "energy", ("208", "958", "957")),
    Nutrient("protein_g", "Protein", "g", "macro", ("203",)),
    Nutrient("fat_g", "Total fat", "g", "macro", ("204",)),
    Nutrient("saturated_fat_g", "Saturated fat", "g", "macro", ("606",)),
    Nutrient("carb_g", "Carbohydrate", "g", "macro", ("205",)),
    Nutrient("fiber_g", "Fiber", "g", "macro", ("291",)),
    Nutrient("sugar_g", "Total sugars", "g", "macro", ("269",)),
    Nutrient("cholesterol_mg", "Cholesterol", "mg", "other", ("601",)),
    Nutrient("sodium_mg", "Sodium", "mg", "mineral", ("307",)),
    Nutrient("potassium_mg", "Potassium", "mg", "mineral", ("306",)),
    Nutrient("calcium_mg", "Calcium", "mg", "mineral", ("301",)),
    Nutrient("iron_mg", "Iron", "mg", "mineral", ("303",)),
    Nutrient("magnesium_mg", "Magnesium", "mg", "mineral", ("304",)),
    Nutrient("zinc_mg", "Zinc", "mg", "mineral", ("309",)),
    Nutrient("vitamin_a_ug", "Vitamin A", "ug", "vitamin", ("320",)),
    Nutrient("vitamin_c_mg", "Vitamin C", "mg", "vitamin", ("401",)),
    Nutrient("vitamin_d_ug", "Vitamin D", "ug", "vitamin", ("328",)),
    Nutrient("vitamin_k_ug", "Vitamin K", "ug", "vitamin", ("430",)),
    Nutrient("vitamin_b12_ug", "Vitamin B12", "ug", "vitamin", ("418",)),
    Nutrient("folate_ug", "Folate", "ug", "vitamin", ("435",)),
)

BY_KEY: dict[str, Nutrient] = {nutrient.key: nutrient for nutrient in CATALOG}
KEYS: tuple[str, ...] = tuple(nutrient.key for nutrient in CATALOG)

# How many of one unit make one of another (used when USDA reports a different unit).
_PER_GRAM: dict[str, float] = {"g": 1.0, "mg": 1_000.0, "ug": 1_000_000.0}


def convert_amount(amount: float, from_unit: str, to_unit: str) -> float | None:
    """Convert a mass between g, mg and ug (any case; USDA writes "UG", "MG", "G").

    Returns None if either unit is not a mass we understand (so nothing is guessed).
    """
    source, target = from_unit.strip().lower(), to_unit.strip().lower()
    if source == "µg":
        source = "ug"
    if source not in _PER_GRAM or target not in _PER_GRAM:
        return None
    return amount / _PER_GRAM[source] * _PER_GRAM[target]


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


# Calories of protein, carbohydrate and fat per gram (the standard "Atwater" factors).
_KCAL_PER_G = {"protein_g": 4.0, "carb_g": 4.0, "fat_g": 9.0}


def energy_mismatch(per_100g: NutrientAmounts) -> bool:
    """Do the stated calories disagree badly with what the protein, carbs and fat add up to?

    Food databases hold typing mistakes (calories per serving entered as per 100 g, a missing
    digit...). This only says "something looks off"; it never changes a value. It needs all four
    numbers, and allows a wide margin (fibre, alcohol and sugar alcohols really do shift it).
    """
    calories = per_100g.get("calories")
    amounts = [per_100g.get(key) for key in _KCAL_PER_G]
    if calories is None or any(amount is None for amount in amounts):
        return False
    estimate = sum(factor * (per_100g.get(key) or 0.0) for key, factor in _KCAL_PER_G.items())
    return abs(calories - estimate) > max(40.0, 0.35 * estimate)
