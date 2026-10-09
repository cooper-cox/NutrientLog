import pytest

from app.calc.nutrients import scale_nutrient, scale_nutrients, sum_nutrients


def test_scale_100_grams_returns_the_per_100g_value() -> None:
    assert scale_nutrient(52.0, 100) == pytest.approx(52.0)


def test_scale_other_amounts() -> None:
    assert scale_nutrient(52.0, 200) == pytest.approx(104.0)
    assert scale_nutrient(52.0, 50) == pytest.approx(26.0)
    assert scale_nutrient(52.0, 0) == 0


def test_unknown_stays_unknown_and_is_not_zero() -> None:
    assert scale_nutrient(None, 100) is None


def test_zero_is_a_real_value() -> None:
    assert scale_nutrient(0.0, 100) == 0.0


def test_negative_grams_are_rejected() -> None:
    with pytest.raises(ValueError):
        scale_nutrient(10.0, -1)


def test_scale_nutrients_for_a_whole_food() -> None:
    banana = {"calories": 89.0, "protein_g": 1.1, "fat_g": None}
    scaled = scale_nutrients(banana, 120)
    assert scaled["calories"] == pytest.approx(106.8)
    assert scaled["protein_g"] == pytest.approx(1.32)
    assert scaled["fat_g"] is None


def test_sum_adds_known_values() -> None:
    totals = sum_nutrients(
        [
            {"calories": 100.0, "protein_g": 5.0},
            {"calories": 250.0, "protein_g": 10.0},
        ]
    )
    assert totals == {"calories": pytest.approx(350.0), "protein_g": pytest.approx(15.0)}


def test_sum_skips_unknown_values_but_keeps_the_known_ones() -> None:
    totals = sum_nutrients([{"iron_mg": 2.0}, {"iron_mg": None}, {"iron_mg": 1.5}])
    assert totals["iron_mg"] == pytest.approx(3.5)


def test_sum_stays_unknown_when_nothing_is_known() -> None:
    totals = sum_nutrients([{"vitamin_k_ug": None}, {"vitamin_k_ug": None}])
    assert totals["vitamin_k_ug"] is None


def test_sum_handles_nutrients_missing_from_some_foods() -> None:
    totals = sum_nutrients([{"calories": 100.0}, {"calories": 50.0, "protein_g": 3.0}])
    assert totals["calories"] == pytest.approx(150.0)
    assert totals["protein_g"] == pytest.approx(3.0)


def test_sum_of_nothing_is_empty() -> None:
    assert sum_nutrients([]) == {}


def test_sum_does_not_turn_a_known_zero_into_unknown() -> None:
    totals = sum_nutrients([{"sugar_g": 0.0}, {"sugar_g": None}])
    assert totals["sugar_g"] == 0.0
