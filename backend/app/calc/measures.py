"""Amounts typed in any unit ("1/2 cup flour", "8 oz", "2 tbsp olive oil") turned into grams.

Grams are the one unit the rest of the app works in. Weights convert exactly. Volumes (cups,
spoons, millilitres) need to know how heavy the food is, so they only convert when the food's own
serving sizes say so ("1 cup = 125 g") or the food is in a short list of well-known densities;
otherwise the answer is "unknown", never a guess. Named servings ("1 bar", "1 slice") use the
food's own serving list.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from app.calc.units import G_PER_OZ

Kind = Literal["mass", "volume", "named"]


class AmountError(ValueError):
    """The amount can't be understood or turned into grams. The message is safe to show."""


class UnknownDensity(AmountError):
    """A volume was given, but nothing says how heavy this food is per cup, spoon or millilitre."""


class UnknownServing(AmountError):
    """A named amount ("1 bar") was given, but the food has no serving with that name."""


# grams per unit (mass) or millilitres per unit (volume). US customary volumes.
MASS_UNITS: dict[str, float] = {"g": 1.0, "kg": 1000.0, "oz": G_PER_OZ, "lb": 453.59237}
VOLUME_UNITS: dict[str, float] = {
    "ml": 1.0,
    "l": 1000.0,
    "tsp": 4.92892159375,
    "tbsp": 14.78676478125,
    "fl oz": 29.5735295625,
    "cup": 236.5882365,
    "pint": 473.176473,
    "quart": 946.352946,
    "gallon": 3785.411784,
}

_ALIASES: dict[str, str] = {
    "g": "g", "gram": "g", "grams": "g", "gm": "g", "gms": "g",
    "kg": "kg", "kilo": "kg", "kilos": "kg", "kilogram": "kg", "kilograms": "kg",
    "oz": "oz", "ounce": "oz", "ounces": "oz",
    "lb": "lb", "lbs": "lb", "pound": "lb", "pounds": "lb",
    "ml": "ml", "milliliter": "ml", "milliliters": "ml", "millilitre": "ml", "millilitres": "ml",
    "l": "l", "liter": "l", "liters": "l", "litre": "l", "litres": "l",
    "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp",
    "tbsp": "tbsp", "tbs": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp",
    "floz": "fl oz", "cup": "cup", "cups": "cup",
    "pint": "pint", "pints": "pint", "pt": "pint",
    "quart": "quart", "quarts": "quart", "qt": "quart",
    "gallon": "gallon", "gallons": "gallon", "gal": "gallon",
}  # fmt: skip

_VULGAR = {"½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅜": 0.375}
_NUMBER = r"(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+(?:\.\d+)?|\.\d+)"
_VULGAR_CLASS = "[" + "".join(_VULGAR) + "]"
_QUANTITY = re.compile(rf"^\s*(?:(\d+)\s*({_VULGAR_CLASS})|({_VULGAR_CLASS})|({_NUMBER}))\s*")
MAX_QUANTITY = 100_000


@dataclass(frozen=True)
class Amount:
    quantity: float
    unit: str | None  # "cup", "g", ... for known units; the typed word ("bar") for named ones
    food: str  # whatever followed the unit: "flour", "peanut butter"; may be empty

    @property
    def kind(self) -> Kind:
        if self.unit in MASS_UNITS:
            return "mass"
        if self.unit in VOLUME_UNITS:
            return "volume"
        return "named"


def _fraction(text: str) -> float:
    # "1 1/2" arrives here with its spaces removed as "11/2", so mixed numbers are handled by the
    # caller; this only sees "a/b".
    top, bottom = text.split("/")
    if float(bottom) == 0:
        raise AmountError("A fraction can't have 0 on the bottom.")
    return float(top) / float(bottom)


def _quantity(match: re.Match[str]) -> float:
    whole, vulgar_after, vulgar, plain = match.groups()
    if vulgar_after:
        return float(whole) + _VULGAR[vulgar_after]
    if vulgar:
        return _VULGAR[vulgar]
    parts = plain.split()
    if len(parts) == 2:  # "1 1/2"
        return float(parts[0]) + _fraction(parts[1].replace(" ", ""))
    if "/" in plain:
        return _fraction(plain.replace(" ", ""))
    return float(plain)


def singular(word: str) -> str:
    word = word.lower().strip(".,")
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith("es") and word[-3:-2] in ("x", "h") and len(word) > 4:
        return word[:-2]
    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        return word[:-1]
    return word


def parse_amount(text: str) -> Amount:
    """Read "1/2 cup flour", "1 1/2 tbsp", "½ cup", "100g peanut butter" or "2 bars"."""
    match = _QUANTITY.match(text)
    if not match:
        raise AmountError("Start with a number, like '1/2 cup' or '100 g'.")
    quantity = _quantity(match)
    if not 0 < quantity <= MAX_QUANTITY:
        raise AmountError("The amount must be more than 0 and not absurdly large.")
    words = text[match.end() :].replace(".", " ").split()
    unit: str | None = None
    if words and words[0].lower() in ("fl", "fluid") and len(words) > 1:
        if words[1].lower() in ("oz", "ounce", "ounces"):
            unit, words = "fl oz", words[2:]
    if unit is None and words:
        first = words[0].lower()
        if first in _ALIASES:
            unit, words = _ALIASES[first], words[1:]
        else:
            unit, words = singular(first), words[1:]
    if words and words[0].lower() == "of":
        words = words[1:]
    return Amount(quantity=quantity, unit=unit, food=" ".join(words))


# Grams per millilitre for well-known plain foods. Only used when the food has no serving that says
# how heavy a cup is. Values are standard kitchen figures.
DENSITY_G_PER_ML: dict[str, float] = {
    "water": 1.0,
    "milk": 1.03,
    "oil": 0.92,
    "honey": 1.42,
    "syrup": 1.37,
    "sugar": 0.85,
    "flour": 0.53,
    "butter": 0.96,
    "juice": 1.04,
}
# Words that mean the name is a different food from the plain one in the list ("peanut butter" is
# not "butter", "brown sugar" is not "sugar"), so the list does not apply.
_NOT_PLAIN = frozenset(
    "peanut almond cashew cocoa shea nut seed apple powdered confectioners icing brown substitute "
    "chocolate cookie cake bread cream sauce dressing candy".split()
)
_WORD = re.compile(r"[a-z]+")


def density_for_name(name: str) -> float | None:
    """Grams per millilitre for a plain food known by name ("Milk, whole", "olive oil"), else None.

    The name must end in the listed word in its first part ("olive oil", "Oil, olive", "Flour,
    wheat"), and contain none of the words that make it a different food.
    """
    lowered = name.lower()
    words = {singular(word) for word in _WORD.findall(lowered)}
    if words & _NOT_PLAIN:
        return None
    first_part = _WORD.findall(lowered.split(",")[0])
    if not first_part:
        return None
    return DENSITY_G_PER_ML.get(singular(first_part[-1]))


@dataclass(frozen=True)
class FoodMeasures:
    """What the food's own serving list says: named units in grams, and a density if it has one."""

    named: dict[str, float]
    density: float | None


_SERVING_LABEL = re.compile(r"^\s*(?P<amount>.+?)\s*\(\s*(?P<grams>[\d.]+)\s*g\s*\)\s*$")


def measures_from_servings(servings: Sequence[tuple[str, float]]) -> FoodMeasures:
    """Turn serving labels like ("1 cup (125 g)", 125) into usable measures.

    A "cup" or "tbsp" serving gives the food's density; "1 bar", "1 slice" become named units.
    If two servings disagree about density the first wins.
    """
    named: dict[str, float] = {}
    density: float | None = None
    for label, grams in servings:
        if grams <= 0:
            continue
        match = _SERVING_LABEL.match(label)
        try:
            amount = parse_amount(match.group("amount") if match else label)
        except AmountError:
            continue
        if amount.unit is None:
            continue
        per_one = grams / amount.quantity
        if amount.kind == "volume":
            if density is None:
                density = per_one / VOLUME_UNITS[amount.unit]
        elif amount.kind == "named":
            named.setdefault(amount.unit, per_one)
    return FoodMeasures(named=named, density=density)


def to_grams(amount: Amount, measures: FoodMeasures | None = None, *, food_name: str = "") -> float:
    """Grams for an amount. Raises UnknownDensity / UnknownServing instead of guessing."""
    measures = measures or FoodMeasures({}, None)
    if amount.kind == "mass":
        return amount.quantity * MASS_UNITS[amount.unit or "g"]
    if amount.kind == "volume":
        density = measures.density
        if density is None:
            density = density_for_name(food_name)
        if density is None:
            raise UnknownDensity(
                "I don't know how heavy this food is per cup or spoon. "
                "Enter it in grams or ounces instead."
            )
        return amount.quantity * VOLUME_UNITS[amount.unit or "ml"] * density
    unit = amount.unit or "serving"
    if unit in measures.named:
        return amount.quantity * measures.named[unit]
    if unit == "serving" and len(measures.named) == 1:
        return amount.quantity * next(iter(measures.named.values()))
    raise UnknownServing(f"This food has no serving called '{unit}'. Try grams or ounces.")
