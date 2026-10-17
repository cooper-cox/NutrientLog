"""Tests for unit conversions and amounts turned into grams."""

import pytest

from app.calc import units
from app.calc.units import AmountUnit, amount_to_grams


@pytest.mark.parametrize(
    ("kg", "lb"),
    [(0, 0), (1, 2.2046226), (45.359237, 100), (80, 176.3698)],
)
def test_kg_lb_known_values(kg: float, lb: float) -> None:
    assert units.kg_to_lb(kg) == pytest.approx(lb, abs=1e-3)
    assert units.lb_to_kg(lb) == pytest.approx(kg, abs=1e-3)


@pytest.mark.parametrize("value", [0.0, 1.0, 72.5, 250.0])
def test_round_trips_return_the_original_value(value: float) -> None:
    assert units.lb_to_kg(units.kg_to_lb(value)) == pytest.approx(value)
    assert units.inches_to_cm(units.cm_to_inches(value)) == pytest.approx(value)
    assert units.oz_to_g(units.g_to_oz(value)) == pytest.approx(value)


def test_inches_and_cm() -> None:
    assert units.inches_to_cm(1) == pytest.approx(2.54)
    assert units.cm_to_inches(2.54) == pytest.approx(1)


def test_feet_inches_to_cm() -> None:
    assert units.feet_inches_to_cm(6, 0) == pytest.approx(182.88)
    assert units.feet_inches_to_cm(5, 10) == pytest.approx(177.8)
    assert units.feet_inches_to_cm(5) == pytest.approx(152.4)


@pytest.mark.parametrize(
    ("cm", "expected"),
    [
        (182.88, (6, 0.0)),
        (177.8, (5, 10.0)),
        (152.4, (5, 0.0)),
        (170.0, (5, 6.9)),
    ],
)
def test_cm_to_feet_inches(cm: float, expected: tuple[int, float]) -> None:
    assert units.cm_to_feet_inches(cm) == expected


def test_cm_to_feet_inches_carries_when_inches_round_up_to_a_full_foot() -> None:
    # 71.96 in is 5 ft 11.96 in, which rounds to 5 ft 12.0 in. That must become 6 ft 0 in.
    assert units.cm_to_feet_inches(71.96 * 2.54) == (6, 0.0)


def test_grams_and_ounces() -> None:
    assert units.g_to_oz(28.349523125) == pytest.approx(1)
    assert units.oz_to_g(1) == pytest.approx(28.349523125)
    assert units.oz_to_g(4) == pytest.approx(113.398, abs=1e-3)


def test_grams_pass_through() -> None:
    assert amount_to_grams(150, "g") == 150


def test_ounces_convert_to_grams() -> None:
    assert amount_to_grams(4, "oz") == pytest.approx(113.398, abs=1e-3)


def test_servings_multiply_by_grams_per_serving() -> None:
    assert amount_to_grams(1, "serving", grams_per_serving=68) == 68  # one bar
    assert amount_to_grams(2, "serving", grams_per_serving=28) == 56  # two slices
    assert amount_to_grams(0.5, "serving", grams_per_serving=68) == 34  # half a bar


def test_one_serving_equals_the_same_grams() -> None:
    # The phone-checklist rule: logging "1 bar" must match logging the equivalent grams.
    assert amount_to_grams(1, "serving", grams_per_serving=68) == amount_to_grams(68, "g")


@pytest.mark.parametrize("amount", [0, -1])
def test_amount_must_be_positive(amount: float) -> None:
    with pytest.raises(ValueError):
        amount_to_grams(amount, "g")


@pytest.mark.parametrize("grams_per_serving", [None, 0, -5])
def test_servings_need_a_positive_grams_per_serving(grams_per_serving: float | None) -> None:
    with pytest.raises(ValueError):
        amount_to_grams(1, "serving", grams_per_serving=grams_per_serving)


def test_unknown_unit_is_rejected() -> None:
    bad_unit: AmountUnit = "cups"  # type: ignore[assignment]
    with pytest.raises(ValueError):
        amount_to_grams(1, bad_unit)
