import pytest

from app.calc.calorie_target import (
    ActivityLevel,
    CalorieTarget,
    GoalType,
    Sex,
    bmr_mifflin_st_jeor,
    calculate_calorie_target,
    daily_adjustment_kcal,
    tdee,
)


def man_target(
    goal: GoalType = GoalType.MAINTAIN,
    rate: float = 0.0,
    activity: ActivityLevel = ActivityLevel.MODERATE,
    *,
    age_years: int = 30,
    height_cm: float = 180.0,
    weight_kg: float = 80.0,
) -> CalorieTarget:
    """Reference person: 30-year-old man, 80 kg, 180 cm.

    BMR = 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    """
    return calculate_calorie_target(
        sex=Sex.MALE,
        age_years=age_years,
        height_cm=height_cm,
        weight_kg=weight_kg,
        activity=activity,
        goal=goal,
        rate_kg_per_week=rate,
    )


def test_bmr_male() -> None:
    assert bmr_mifflin_st_jeor(80, 180, 30, Sex.MALE) == pytest.approx(1780)


def test_bmr_female() -> None:
    # 10*65 + 6.25*165 - 5*30 - 161 = 650 + 1031.25 - 150 - 161 = 1370.25
    assert bmr_mifflin_st_jeor(65, 165, 30, Sex.FEMALE) == pytest.approx(1370.25)


@pytest.mark.parametrize(
    ("activity", "factor"),
    [
        (ActivityLevel.SEDENTARY, 1.2),
        (ActivityLevel.LIGHT, 1.375),
        (ActivityLevel.MODERATE, 1.55),
        (ActivityLevel.VERY_ACTIVE, 1.725),
        (ActivityLevel.EXTRA_ACTIVE, 1.9),
    ],
)
def test_tdee_uses_the_right_activity_factor(activity: ActivityLevel, factor: float) -> None:
    assert tdee(1000, activity) == pytest.approx(1000 * factor)


def test_adjustment_direction_and_size() -> None:
    # 0.25 kg/week * 7700 kcal/kg / 7 days = 275 kcal/day
    assert daily_adjustment_kcal(GoalType.GAIN, 0.25) == pytest.approx(275)
    assert daily_adjustment_kcal(GoalType.LOSE, 0.25) == pytest.approx(-275)
    assert daily_adjustment_kcal(GoalType.MAINTAIN, 0.25) == 0


def test_maintain_equals_tdee() -> None:
    result = man_target(GoalType.MAINTAIN)
    assert result.calories == 2759  # 1780 * 1.55
    assert result.daily_adjustment == 0


def test_gain_is_above_maintenance() -> None:
    result = man_target(GoalType.GAIN, rate=0.25)
    assert result.calories == 3034  # 2759 + 275
    assert result.daily_adjustment == pytest.approx(275)
    assert not result.rate_was_capped


def test_lose_is_below_maintenance() -> None:
    result = man_target(GoalType.LOSE, rate=0.5)
    assert result.calories == 2209  # 2759 - 550
    assert result.daily_adjustment == pytest.approx(-550)


def test_extreme_gain_rate_is_capped() -> None:
    result = man_target(GoalType.GAIN, rate=2.0)
    assert result.rate_was_capped
    assert result.rate_kg_per_week == 0.5
    assert result.daily_adjustment == pytest.approx(550)


def test_extreme_loss_rate_is_capped() -> None:
    result = man_target(GoalType.LOSE, rate=3.0)
    assert result.rate_was_capped
    assert result.rate_kg_per_week == 1.0
    assert result.daily_adjustment == pytest.approx(-1100)


def test_maintain_ignores_a_rate_and_does_not_report_capping() -> None:
    result = man_target(GoalType.MAINTAIN, rate=1.0)
    assert result.daily_adjustment == 0
    assert not result.rate_was_capped


def test_calorie_floor_is_applied_for_small_dieters() -> None:
    # 40-year-old woman, 45 kg, 150 cm, sedentary, losing 0.5 kg/week:
    # BMR 1026.5 -> TDEE 1231.8 -> minus 550 = 681.8, which is below the 1200 floor.
    result = calculate_calorie_target(
        sex=Sex.FEMALE,
        age_years=40,
        height_cm=150.0,
        weight_kg=45.0,
        activity=ActivityLevel.SEDENTARY,
        goal=GoalType.LOSE,
        rate_kg_per_week=0.5,
    )
    assert result.calories == 1200
    assert result.floor_was_applied


def test_floor_is_not_reported_when_not_needed() -> None:
    assert not man_target().floor_was_applied


@pytest.mark.parametrize("age_years", [17, 101])
def test_out_of_range_age_is_rejected(age_years: int) -> None:
    with pytest.raises(ValueError, match="age"):
        man_target(age_years=age_years)


@pytest.mark.parametrize("height_cm", [99.0, 251.0])
def test_out_of_range_height_is_rejected(height_cm: float) -> None:
    with pytest.raises(ValueError, match="height"):
        man_target(height_cm=height_cm)


@pytest.mark.parametrize("weight_kg", [29.0, 301.0])
def test_out_of_range_weight_is_rejected(weight_kg: float) -> None:
    with pytest.raises(ValueError, match="weight"):
        man_target(weight_kg=weight_kg)


def test_negative_rate_is_rejected() -> None:
    with pytest.raises(ValueError, match="rate"):
        man_target(GoalType.GAIN, rate=-0.5)


def test_more_activity_never_lowers_the_target() -> None:
    targets = [man_target(activity=level).calories for level in ActivityLevel]
    assert targets == sorted(targets)
