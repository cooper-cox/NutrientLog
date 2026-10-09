import pytest

from app.calc.macros import (
    KCAL_PER_G_CARB,
    KCAL_PER_G_FAT,
    KCAL_PER_G_PROTEIN,
    calculate_macro_targets,
)


def test_typical_gain_target() -> None:
    # 80 kg, 3034 kcal:
    #   protein = 1.8 * 80 = 144 g (576 kcal)
    #   fat     = 25% of 3034 / 9 = 84.3 g (758.5 kcal)
    #   carbs   = (3034 - 576 - 758.5) / 4 = 424.9 g
    macros = calculate_macro_targets(3034, 80)
    assert (macros.protein_g, macros.fat_g, macros.carb_g) == (144, 84, 425)


def test_protein_is_capped_at_35_percent_of_calories_for_heavy_people() -> None:
    # 200 kg would want 360 g protein (1440 kcal), but 35% of 1500 kcal is only 131.25 g.
    macros = calculate_macro_targets(1500, 200)
    assert macros.protein_g == 131
    assert macros.fat_g == 42  # 25% of 1500 / 9 = 41.7
    assert macros.carb_g == 150  # the remaining 600 kcal / 4


@pytest.mark.parametrize("calories", [1200, 1500, 2000, 2759, 3034, 4500])
@pytest.mark.parametrize("weight_kg", [40, 80, 150, 300])
def test_macros_add_back_up_to_the_calories_and_are_never_negative(
    calories: int, weight_kg: float
) -> None:
    macros = calculate_macro_targets(calories, weight_kg)
    assert macros.protein_g > 0
    assert macros.fat_g > 0
    assert macros.carb_g > 0
    total = (
        macros.protein_g * KCAL_PER_G_PROTEIN
        + macros.fat_g * KCAL_PER_G_FAT
        + macros.carb_g * KCAL_PER_G_CARB
    )
    # Each gram value is rounded to a whole gram, so allow a small difference.
    assert total == pytest.approx(calories, abs=15)


@pytest.mark.parametrize(("calories", "weight_kg"), [(0, 80), (-100, 80), (2000, 0), (2000, -5)])
def test_invalid_inputs_are_rejected(calories: float, weight_kg: float) -> None:
    with pytest.raises(ValueError):
        calculate_macro_targets(calories, weight_kg)
