import pytest

from app.calc.servings import AmountUnit, amount_to_grams


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
