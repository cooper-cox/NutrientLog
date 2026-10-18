from app.foods import collapse_lookalikes
from app.sources import FoodCandidate, ServingCandidate


def food(
    name: str, brand: str | None, kcal: float, grams: float = 68.0, generic: bool = False
) -> FoodCandidate:
    return FoodCandidate(
        source="usda",
        source_id=name,
        name=name,
        brand=brand,
        barcode=None,
        nutrients={"calories": kcal, "protein_g": 16.2, "fat_g": 12.0, "carb_g": 46.0},
        servings=[ServingCandidate(f"1 bar ({grams:g} g)", grams)],
        is_generic=generic,
    )


def names(found: list[FoodCandidate]) -> list[str]:
    return [item.name for item in found]


def test_the_same_label_under_different_wording_shows_once_with_the_simpler_name() -> None:
    wordy = food("Peanut Butter Nut Butter Bar", "Clif", 382.4)
    simple = food("Nut Butter Bar", "Clif Bar", 382.4)
    other_flavour = food("Nut Butter Bar, Chocolate", "Clif", 360.0)
    assert names(collapse_lookalikes([wordy, other_flavour, simple])) == [
        "Nut Butter Bar",
        "Nut Butter Bar, Chocolate",
    ]


def test_different_serving_or_numbers_stay_apart() -> None:
    a = food("Bar", "Clif", 382.4, grams=68)
    b = food("Bar mini", "Clif", 382.4, grams=34)
    c = food("Bar big", "Clif", 450.0, grams=68)
    assert len(collapse_lookalikes([a, b, c])) == 3


def test_other_brands_and_missing_brands_are_never_merged() -> None:
    assert len(collapse_lookalikes([food("Bar", "Clif", 382.4), food("Bar x", "Kind", 382.4)])) == 2
    assert len(collapse_lookalikes([food("Bar", None, 382.4), food("Bar x", None, 382.4)])) == 2


def test_plain_foods_are_untouched_by_the_label_rule() -> None:
    a = food("Rice, white", "Clif", 130.0, generic=True)
    b = food("Rice, brown", "Clif", 130.0, generic=True)
    assert len(collapse_lookalikes([a, b])) == 2
