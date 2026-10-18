"""Tests for amounts typed in any unit and turned into grams."""

import pytest

from app.calc.measures import (
    Amount,
    AmountError,
    FoodMeasures,
    UnknownDensity,
    UnknownServing,
    density_for_name,
    measures_from_servings,
    parse_amount,
    singular,
    to_grams,
)

CUP_ML = 236.5882365


@pytest.mark.parametrize(
    ("text", "quantity", "unit", "food"),
    [
        ("1/2 cup flour", 0.5, "cup", "flour"),
        ("1 1/2 tbsp olive oil", 1.5, "tbsp", "olive oil"),
        ("½ cup", 0.5, "cup", ""),
        ("1½ cups milk", 1.5, "cup", "milk"),
        ("100g peanut butter", 100, "g", "peanut butter"),
        ("100 grams", 100, "g", ""),
        ("2.5 oz", 2.5, "oz", ""),
        ("1 fl oz vanilla extract", 1, "fl oz", "vanilla extract"),
        ("1 fluid ounce", 1, "fl oz", ""),
        ("1 fl. oz.", 1, "fl oz", ""),
        ("1.5 L water", 1.5, "l", "water"),
        ("3 slices of bread", 3, "slice", "bread"),
        ("2 bars", 2, "bar", ""),
        ("1 bowl", 1, "bowl", ""),
        ("  .5 cup", 0.5, "cup", ""),
        ("2", 2, None, ""),
    ],
)
def test_parse_amount(text: str, quantity: float, unit: str | None, food: str) -> None:
    assert parse_amount(text) == Amount(quantity, unit, food)


@pytest.mark.parametrize(
    "text", ["", "flour", "cup of flour", "0 cup", "-1 cup", "1/0 cup", "9999999 g"]
)
def test_parse_amount_rejects_nonsense(text: str) -> None:
    with pytest.raises(AmountError):
        parse_amount(text)


def test_weights_convert_exactly() -> None:
    assert to_grams(parse_amount("100 g")) == 100
    assert to_grams(parse_amount("1 kg")) == 1000
    assert to_grams(parse_amount("8 oz")) == pytest.approx(226.796, abs=1e-3)
    assert to_grams(parse_amount("1 lb")) == pytest.approx(453.592, abs=1e-3)


def test_volume_uses_the_foods_own_cup_weight() -> None:
    measures = measures_from_servings([("1 cup (125 g)", 125)])
    assert to_grams(parse_amount("1/2 cup flour"), measures) == pytest.approx(62.5)
    assert to_grams(parse_amount("2 tbsp"), measures) == pytest.approx(125 * 2 * 14.78676 / CUP_ML)
    assert to_grams(parse_amount("100 ml"), measures) == pytest.approx(125 * 100 / CUP_ML)


def test_volume_falls_back_to_a_known_plain_food() -> None:
    grams = to_grams(parse_amount("1 cup milk"), None, food_name="Milk, whole")
    assert grams == pytest.approx(CUP_ML * 1.03)
    assert to_grams(parse_amount("250 ml"), None, food_name="Water") == pytest.approx(250)


def test_the_foods_own_serving_beats_the_name_list() -> None:
    measures = measures_from_servings([("1 cup (200 g)", 200)])
    assert to_grams(parse_amount("1 cup"), measures, food_name="Water") == pytest.approx(200)


def test_unknown_density_is_reported_not_guessed() -> None:
    with pytest.raises(UnknownDensity):
        to_grams(parse_amount("1 fl oz"), None, food_name="Vanilla extract")
    with pytest.raises(UnknownDensity):
        to_grams(parse_amount("1 cup"), FoodMeasures({"bar": 68}, None), food_name="Clif Bar")


@pytest.mark.parametrize(
    "name",
    ["Peanut butter", "Brown sugar", "Sugars, brown", "Milk chocolate", "Butter, peanut", ""],
)
def test_different_foods_do_not_borrow_a_plain_foods_density(name: str) -> None:
    assert density_for_name(name) is None


@pytest.mark.parametrize(
    ("name", "density"),
    [
        ("Milk, whole", 1.03),
        ("olive oil", 0.92),
        ("Oil, olive, salad", 0.92),
        ("Flour, wheat", 0.53),
    ],
)
def test_plain_foods_have_a_density(name: str, density: float) -> None:
    assert density_for_name(name) == density


def test_named_servings() -> None:
    measures = measures_from_servings([("1 bar (68 g)", 68), ("2 slices (56 g)", 56)])
    assert to_grams(parse_amount("2 bars"), measures) == 136
    assert to_grams(parse_amount("3 slices"), measures) == pytest.approx(84)
    assert to_grams(parse_amount("1 bar of"), measures) == 68


def test_a_serving_means_the_only_serving() -> None:
    assert (
        to_grams(parse_amount("2 servings"), measures_from_servings([("1 bowl (28 g)", 28)])) == 56
    )
    assert to_grams(parse_amount("1"), measures_from_servings([("1 bowl (28 g)", 28)])) == 28


def test_an_unknown_serving_name_is_reported() -> None:
    with pytest.raises(UnknownServing):
        to_grams(parse_amount("1 bowl"), measures_from_servings([("1 bar (68 g)", 68)]))
    with pytest.raises(UnknownServing):
        to_grams(parse_amount("1 serving"), None)


def test_an_unknown_serving_lists_the_ones_the_food_has() -> None:
    measures = measures_from_servings([("1 medium (118 g)", 118), ("1 large (136 g)", 136)])
    with pytest.raises(UnknownServing, match="'medium', 'large'"):
        to_grams(parse_amount("2 bananas"), measures)


def test_servings_without_a_usable_label_are_skipped() -> None:
    measures = measures_from_servings(
        [("big (50 g)", 50), ("1 cup (0 g)", 0), ("1 slice (28 g)", 28)]
    )
    assert measures.named == {"slice": 28.0} and measures.density is None


def test_singular() -> None:
    assert [singular(w) for w in ("slices", "bars", "patties", "boxes", "glass", "oz")] == [
        "slice",
        "bar",
        "patty",
        "box",
        "glass",
        "oz",
    ]
