"""The choices offered for "how much?": the food's own servings, rough sizes, and exact units.

Most people know "a small bowl" or "half the tub", not grams. Each choice is a unit with the grams
in ONE of it; the phone multiplies by how many. Choices come in three kinds:

* the food's own servings ("1 medium", "1 package"): exact for that food;
* rough sizes (bowls, plates, small/large portion): estimates, marked as such, built from a typical
  volume and the food's weight per cup, or from a multiple of its own serving;
* exact units (grams, ounces, and cups/spoons when the food's weight per cup is known).

A rough size is only offered when the numbers behind it are known; nothing is invented from nothing.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from app.calc.measures import (
    VOLUME_UNITS,
    Amount,
    FoodMeasures,
    density_for_name,
    measures_from_servings,
    parse_amount,
    to_grams,
)
from app.calc.units import G_PER_OZ
from app.settings import settings

Kind = Literal["own", "rough", "exact"]

# How many of a unit the wheel offers, nearest first. Fractions are the ones people say aloud.
_FRACTIONS = (0.25, 1 / 3, 0.5, 2 / 3, 0.75)
_COUNTS = (1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10)
PORTION_QUANTITIES: tuple[float, ...] = (*_FRACTIONS[:3], *_FRACTIONS[3:], *_COUNTS)
GRAM_QUANTITIES: tuple[float, ...] = tuple(
    float(n) for n in (*range(5, 100, 5), *range(100, 505, 10))
)
OUNCE_QUANTITIES: tuple[float, ...] = (
    0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 24, 32,
)  # fmt: skip
MILLILITRE_QUANTITIES: tuple[float, ...] = tuple(float(n) for n in range(25, 1025, 25))


@dataclass(frozen=True)
class Portion:
    label: str  # "small bowl"; this is also what is typed after the number ("2 small bowls")
    grams: float  # grams in ONE of it
    kind: Kind
    note: str  # "about 6 oz (170 g)" for a rough size, else ""
    quantities: tuple[float, ...]


def _note(grams: float) -> str:
    ounces = grams / G_PER_OZ
    oz = f"{ounces:.0f}" if ounces >= 10 else f"{ounces:.1f}".rstrip("0").rstrip(".")
    return f"about {oz} oz ({grams:.0f} g)"


def _rough(label: str, grams: float) -> Portion:
    return Portion(label, round(grams, 2), "rough", _note(grams), PORTION_QUANTITIES)


def _measures(food_name: str, servings: Sequence[tuple[str, float]]) -> FoodMeasures:
    base = measures_from_servings(servings)
    if base.density is None:
        return FoodMeasures(base.named, density_for_name(food_name))
    return base


# Grams per millilitre of foods people eat from a bowl, used ONLY to size bowls and plates (never
# for "cup" or "tbsp", which need the food's real weight per cup). Standard kitchen figures.
BOWL_DENSITY_G_PER_ML: dict[str, float] = {
    "yogurt": 1.04,
    "yoghurt": 1.04,
    "skyr": 1.04,
    "kefir": 1.03,
    "pudding": 1.1,
    "applesauce": 1.05,
    "soup": 1.0,
    "chili": 1.0,
    "stew": 1.0,
    "oatmeal": 1.0,
    "porridge": 1.0,
    "cottage": 0.96,
    "ricotta": 1.0,
    "hummus": 1.0,
    "rice": 0.74,
    "pasta": 0.6,
    "noodle": 0.6,
    "macaroni": 0.6,
    "spaghetti": 0.6,
    "cereal": 0.25,
    "granola": 0.45,
    "salad": 0.25,
    "ice cream": 0.55,
}


def _bowl_density(food_name: str) -> float | None:
    lowered = food_name.lower()
    for word, density in BOWL_DENSITY_G_PER_ML.items():
        if word in lowered:
            return density
    return None


def portion_options(food_name: str, servings: Sequence[tuple[str, float]]) -> list[Portion]:
    """Every choice for this food, own servings first, then rough sizes, then exact units."""
    config = settings.portions
    measures = _measures(food_name, servings)
    bowl_density = measures.density or _bowl_density(food_name)
    cup_grams = bowl_density * VOLUME_UNITS["cup"] if bowl_density else None
    options: list[Portion] = [
        Portion(name, round(grams, 2), "own", "", PORTION_QUANTITIES)
        for name, grams in measures.named.items()
    ]
    if cup_grams is not None:
        for label, cups in (
            ("small bowl", config.small_bowl_cups),
            ("medium bowl", config.medium_bowl_cups),
            ("large bowl", config.large_bowl_cups),
            ("small plate", config.small_plate_cups),
            ("plate", config.medium_plate_cups),
            ("large plate", config.large_plate_cups),
        ):
            options.append(_rough(label, cups * cup_grams))
    else:
        first = next((grams for _, grams in servings if grams > 0), None)
        if first is not None:
            options.append(_rough("small portion", first * config.small_portion_factor))
            options.append(_rough("large portion", first * config.large_portion_factor))
    if measures.density is not None:
        for unit, label in (("cup", "cup"), ("tbsp", "tbsp"), ("tsp", "tsp")):
            grams = measures.density * VOLUME_UNITS[unit]
            options.append(Portion(label, round(grams, 2), "exact", "", PORTION_QUANTITIES))
    options.append(Portion("g", 1.0, "exact", "", GRAM_QUANTITIES))
    options.append(Portion("oz", round(G_PER_OZ, 4), "exact", "", OUNCE_QUANTITIES))
    if measures.density is not None:
        ml = Portion("ml", round(measures.density, 4), "exact", "", MILLILITRE_QUANTITIES)
        options.append(ml)
    # A food's own serving can share a name with a rough size or unit; the first one wins.
    seen: set[str] = set()
    unique = []
    for option in options:
        if option.label not in seen:
            seen.add(option.label)
            unique.append(option)
    return unique


def grams_for_text(
    text: str, food_name: str, servings: Sequence[tuple[str, float]]
) -> tuple[float, Amount]:
    """Grams for a typed amount, understanding the rough sizes too ("1/2 small bowl")."""
    measures = _measures(food_name, servings)
    options = portion_options(food_name, servings)
    rough = {o.label: o.grams for o in options if o.kind == "rough"}
    known = FoodMeasures(named={**rough, **measures.named}, density=measures.density)
    amount = parse_amount(text, units=tuple(known.named))
    return to_grams(amount, known, food_name=food_name), amount
