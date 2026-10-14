"""Checks on a food someone types in by hand. Every problem is reported at once.

Field names match the request body (``name``, ``nutrients.calories``, ``servings.0.grams``) so the
app can show each message under the right box.
"""

from collections.abc import Mapping, Sequence

from app.calc.calorie_target import InvalidInputError, Problem
from app.calc.nutrient_catalog import BY_KEY, MAX_PER_100G

MAX_NAME_LENGTH = 200
MAX_BRAND_LENGTH = 100
MAX_SERVINGS = 20
MAX_SERVING_GRAMS = 5000.0
MAX_SERVING_LABEL_LENGTH = 60
# Protein + fat + carbohydrate cannot add up to more than the food itself weighs. A little slack
# covers rounding on labels (e.g. 33.4 + 33.3 + 33.4).
MAX_MACRO_GRAMS_PER_100G = 101.0


def clean_text(value: str | None) -> str | None:
    """Trim spaces; a blank value means "not given"."""
    if value is None:
        return None
    value = " ".join(value.split())
    return value or None


def check_food(
    name: str | None,
    brand: str | None,
    nutrients: Mapping[str, float | None],
    servings: Sequence[tuple[str, float]],
) -> None:
    """Raise InvalidInputError listing everything wrong with the food, or return quietly."""
    problems: list[Problem] = []

    if name is None:
        problems.append(Problem("name", "Give the food a name."))
    elif len(name) > MAX_NAME_LENGTH:
        problems.append(Problem("name", f"The name can be at most {MAX_NAME_LENGTH} characters."))
    if brand is not None and len(brand) > MAX_BRAND_LENGTH:
        problems.append(
            Problem("brand", f"The brand can be at most {MAX_BRAND_LENGTH} characters.")
        )

    for key, value in nutrients.items():
        definition = BY_KEY.get(key)
        if definition is None:
            problems.append(Problem(f"nutrients.{key}", f"'{key}' is not a nutrient we track."))
        elif value is not None:
            ceiling = MAX_PER_100G[definition.unit]
            if value < 0 or value > ceiling:
                problems.append(
                    Problem(
                        f"nutrients.{key}",
                        f"{definition.name} per 100 g must be between 0 and {ceiling:g} "
                        f"{definition.unit}.",
                    )
                )

    if nutrients.get("calories") is None:
        problems.append(
            Problem("nutrients.calories", "Calories are needed (use 0 for a calorie-free food).")
        )

    macros = [nutrients.get(key) for key in ("protein_g", "fat_g", "carb_g")]
    known = [value for value in macros if value is not None and value >= 0]
    if sum(known) > MAX_MACRO_GRAMS_PER_100G:
        problems.append(
            Problem(
                "nutrients.protein_g",
                "Protein, fat and carbs together can't be more than 100 g per 100 g of food.",
            )
        )

    if len(servings) > MAX_SERVINGS:
        problems.append(Problem("servings", f"A food can have at most {MAX_SERVINGS} servings."))
    seen: set[str] = set()
    for index, (label, grams) in enumerate(servings):
        if not label:
            problems.append(Problem(f"servings.{index}.label", "Name this serving."))
        elif len(label) > MAX_SERVING_LABEL_LENGTH:
            problems.append(
                Problem(
                    f"servings.{index}.label",
                    f"A serving name can be at most {MAX_SERVING_LABEL_LENGTH} characters.",
                )
            )
        elif label.lower() in seen:
            problems.append(Problem(f"servings.{index}.label", "Two servings have the same name."))
        seen.add(label.lower())
        if grams <= 0 or grams > MAX_SERVING_GRAMS:
            problems.append(
                Problem(
                    f"servings.{index}.grams",
                    f"A serving must weigh more than 0 and at most {MAX_SERVING_GRAMS:g} g.",
                )
            )

    if problems:
        raise InvalidInputError(problems)
