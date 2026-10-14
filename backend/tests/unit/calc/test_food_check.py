import pytest

from app.calc.calorie_target import InvalidInputError
from app.calc.food_check import check_food, clean_text
from app.calc.nutrient_catalog import BY_KEY, CATALOG, KEYS, convert_amount

GOOD = {"calories": 250.0, "protein_g": 10.0, "fat_g": 5.0, "carb_g": 40.0}


def problems(
    name: str | None = "Oats",
    brand: str | None = None,
    nutrients: dict[str, float | None] | None = None,
    servings: list[tuple[str, float]] | None = None,
) -> dict[str, str]:
    try:
        check_food(name, brand, GOOD if nutrients is None else nutrients, servings or [])
    except InvalidInputError as error:
        return {problem.field: problem.message for problem in error.problems}
    return {}


def test_a_good_food_passes() -> None:
    assert problems(servings=[("1 cup", 80.0)]) == {}


def test_catalog_keys_are_unique_and_calories_comes_first() -> None:
    assert len(set(KEYS)) == len(CATALOG)
    assert KEYS[0] == "calories"
    assert set(BY_KEY) == set(KEYS)


def test_clean_text_trims_and_collapses_spaces() -> None:
    assert clean_text("  Clif   Bar ") == "Clif Bar"
    assert clean_text("   ") is None
    assert clean_text(None) is None


def test_name_is_required() -> None:
    assert problems(name=None) == {"name": "Give the food a name."}


def test_name_and_brand_have_length_limits() -> None:
    found = problems(name="x" * 201, brand="y" * 101)
    assert set(found) == {"name", "brand"}


def test_calories_are_required_but_zero_is_fine() -> None:
    assert "nutrients.calories" in problems(nutrients={"protein_g": 1.0})
    assert "nutrients.calories" in problems(nutrients={"calories": None})
    assert problems(nutrients={"calories": 0.0}) == {}


def test_unknown_nutrients_are_allowed_to_be_missing_or_null() -> None:
    assert problems(nutrients={"calories": 100.0, "sodium_mg": None}) == {}


def test_a_nutrient_we_do_not_track_is_rejected() -> None:
    found = problems(nutrients={**GOOD, "unobtainium_g": 1.0})
    assert found == {"nutrients.unobtainium_g": "'unobtainium_g' is not a nutrient we track."}


@pytest.mark.parametrize(
    ("key", "value", "limit"),
    [("calories", 901.0, "900 kcal"), ("protein_g", -1.0, "100 g"), ("sodium_mg", 40_001.0, "mg")],
)
def test_amounts_out_of_range_are_rejected(key: str, value: float, limit: str) -> None:
    found = problems(nutrients={"calories": 100.0, key: value})
    assert limit in found[f"nutrients.{key}"]


def test_the_macros_cannot_outweigh_the_food() -> None:
    found = problems(
        nutrients={"calories": 400.0, "protein_g": 50.0, "fat_g": 40.0, "carb_g": 30.0}
    )
    assert "nutrients.protein_g" in found
    assert (
        problems(nutrients={"calories": 400.0, "protein_g": 33.4, "fat_g": 33.3, "carb_g": 33.4})
        == {}
    )


def test_servings_are_checked_one_by_one() -> None:
    found = problems(
        servings=[("", 10.0), ("Slice", 0.0), ("slice", 20.0), ("Big", 5001.0), ("x" * 61, 5.0)]
    )
    assert set(found) == {
        "servings.0.label",
        "servings.1.grams",
        "servings.2.label",
        "servings.3.grams",
        "servings.4.label",
    }


def test_too_many_servings() -> None:
    many = [(f"s{i}", 10.0) for i in range(21)]
    assert "servings" in problems(servings=many)


def test_every_problem_is_reported_at_once() -> None:
    found = problems(name=None, nutrients={"protein_g": 500.0}, servings=[("", -1.0)])
    assert {"name", "nutrients.calories", "nutrients.protein_g", "servings.0.label"} <= set(found)


def test_convert_amount() -> None:
    assert convert_amount(1.0, "G", "mg") == 1000.0
    assert convert_amount(500.0, "MG", "g") == 0.5
    assert convert_amount(2.0, "UG", "ug") == 2.0
    assert convert_amount(1.0, "µg", "mg") == pytest.approx(0.001)
    assert convert_amount(1.0, "IU", "ug") is None
    assert convert_amount(1.0, "g", "kcal") is None
