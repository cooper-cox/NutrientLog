"""The nutrients the app knows about, in one place.

Foods store each nutrient per 100 g under a short key (``protein_g``). Adding a nutrient later
means adding one line here: no database change is needed, because nutrient values are stored as
rows of (food, key, amount), not as one column per nutrient.

``usda_numbers`` are FoodData Central's classic nutrient numbers, in order of preference (the
first one a food has is used). The catalog says what unit each nutrient is kept in; amounts from
USDA in another unit (e.g. grams for a nutrient we keep in mg) are converted.
"""

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
