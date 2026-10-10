import pytest

from app.calc.calorie_target import (
    CALORIE_FLOOR,
    ActivityLevel,
    GoalType,
    InvalidInputError,
    Sex,
    bmr_mifflin_st_jeor,
    calculate_calorie_target,
)
from app.calc.goals import check_goal_weight, weeks_to_goal


def test_no_answer_is_halfway_between_male_and_female() -> None:
    male = bmr_mifflin_st_jeor(80, 180, 30, Sex.MALE)
    female = bmr_mifflin_st_jeor(80, 180, 30, Sex.FEMALE)
    assert bmr_mifflin_st_jeor(80, 180, 30, Sex.NO_ANSWER) == pytest.approx((male + female) / 2)


def test_no_answer_floor_is_halfway_between_the_two_floors() -> None:
    assert CALORIE_FLOOR[Sex.NO_ANSWER] == (CALORIE_FLOOR[Sex.MALE] + CALORIE_FLOOR[Sex.FEMALE]) / 2


def test_no_answer_floor_is_applied() -> None:
    target = calculate_calorie_target(
        sex=Sex.NO_ANSWER,
        age_years=40,
        height_cm=150,
        weight_kg=45,
        activity=ActivityLevel.SEDENTARY,
        goal=GoalType.LOSE,
        rate_kg_per_week=0.5,
    )
    assert target.calories == 1350
    assert target.floor_was_applied


def test_range_errors_name_the_field_and_are_still_value_errors() -> None:
    with pytest.raises(InvalidInputError) as caught:
        calculate_calorie_target(
            sex=Sex.MALE,
            age_years=17,
            height_cm=180,
            weight_kg=80,
            activity=ActivityLevel.MODERATE,
            goal=GoalType.GAIN,
        )
    assert caught.value.field == "birth_date"
    assert isinstance(caught.value, ValueError)


@pytest.mark.parametrize(
    ("goal", "goal_weight"),
    [(GoalType.GAIN, 85), (GoalType.LOSE, 75), (GoalType.MAINTAIN, 60), (GoalType.GAIN, None)],
)
def test_sensible_goal_weights_pass(goal: GoalType, goal_weight: float | None) -> None:
    check_goal_weight(goal, 80, goal_weight)


@pytest.mark.parametrize(
    ("goal", "goal_weight"), [(GoalType.GAIN, 80), (GoalType.GAIN, 70), (GoalType.LOSE, 80)]
)
def test_goal_weights_pointing_the_wrong_way_fail(goal: GoalType, goal_weight: float) -> None:
    with pytest.raises(InvalidInputError) as caught:
        check_goal_weight(goal, 80, goal_weight)
    assert caught.value.field == "goal_weight_kg"


@pytest.mark.parametrize(
    ("weight", "goal_weight", "rate", "expected"),
    [
        (80, 85, 0.25, 20),
        (80, 85, 0.3, 17),  # 16.67 rounds up
        (80, 75, 0.5, 10),
        (80, 80, 0.5, 0),
        (80, None, 0.5, None),
        (80, 85, 0, None),
    ],
)
def test_weeks_to_goal(
    weight: float, goal_weight: float | None, rate: float, expected: int | None
) -> None:
    assert weeks_to_goal(weight, goal_weight, rate) == expected
