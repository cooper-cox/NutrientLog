"""Tests for the profile checks, including the shared cases the phone also uses."""

import json
from pathlib import Path
from typing import Any

import pytest

from app.calc.goals import (
    ActivityLevel,
    GoalType,
    InvalidInputError,
    Problem,
    Sex,
    calculate_calorie_target,
)
from app.calc.profile_check import bmi, check_profile, limits
from app.calc.units import format_height_limit, format_weight_limit, lb_to_kg

# A 30-year-old man, 6 ft tall (182.9 cm), 180 lb, who wants to gain.
GOOD: dict[str, Any] = {
    "age_years": 30,
    "height_cm": 182.9,
    "weight_kg": 81.6,
    "goal_weight_kg": 90.0,
    "goal": GoalType.GAIN,
    "rate_kg_per_week": 0.25,
    "units": "imperial",
}


def problems(**changes: Any) -> dict[str, str]:
    result = check_profile(**{**GOOD, **changes})
    return {problem.field: problem.message for problem in result}


def test_sensible_answers_have_no_problems() -> None:
    assert check_profile(**GOOD) == []


# --- the cases found on the phone ------------------------------------------------------------


def test_a_goal_weight_of_1100_lb_is_rejected() -> None:
    found = problems(goal_weight_kg=lb_to_kg(1100))
    assert found == {"goal_weight_kg": "Goal weight must be between 70 lb and 660 lb."}


def test_80_lb_at_6_ft_is_rejected_as_not_adding_up() -> None:
    found = problems(weight_kg=lb_to_kg(80), goal_weight_kg=None)
    assert "don't look right together" in found["weight_kg"]
    assert "talk to a doctor" in found["weight_kg"]


def test_a_very_low_goal_weight_for_someone_who_wants_to_lose_is_rejected() -> None:
    # At 6 ft, a BMI of 18.5 is 61.9 kg (136.4 lb); the limit is shown rounded up to 140 lb.
    found = problems(weight_kg=81.6, goal_weight_kg=lb_to_kg(100), goal=GoalType.LOSE)
    assert found == {
        "goal_weight_kg": "For your height, the lowest goal weight we can set is about 140 lb."
    }


def test_the_lowest_goal_weight_allowed_is_accepted() -> None:
    # 18.5 BMI at 182.9 cm is 61.89 kg = 136.4 lb, so the message says "about 140 lb".
    lowest_kg = 18.5 * 1.829**2
    assert problems(goal_weight_kg=lowest_kg + 0.1, goal=GoalType.LOSE) == {}
    assert (
        "lowest goal weight"
        in problems(goal_weight_kg=lowest_kg - 0.1, goal=GoalType.LOSE)["goal_weight_kg"]
    )


def test_a_very_high_goal_weight_is_rejected_with_the_limit_for_that_height() -> None:
    found = problems(goal_weight_kg=200.0)
    assert found == {
        "goal_weight_kg": "For your height, the highest goal weight we can set is about 330 lb."
    }


# --- messages follow the person's units --------------------------------------------------------


def test_range_errors_are_worded_in_pounds_and_feet_for_imperial() -> None:
    found = problems(height_cm=300.0, weight_kg=500.0, goal_weight_kg=None)
    assert found == {
        "height_cm": "Height must be between 3 ft 6 in and 8 ft.",
        "weight_kg": "Weight must be between 70 lb and 660 lb.",
    }


def test_range_errors_are_worded_in_kilograms_and_centimetres_for_metric() -> None:
    found = problems(height_cm=300.0, weight_kg=500.0, goal_weight_kg=None, units="metric")
    assert found == {
        "height_cm": "Height must be between 100 cm and 250 cm.",
        "weight_kg": "Weight must be between 30 kg and 300 kg.",
    }


@pytest.mark.parametrize(
    ("kg", "units", "round_up", "step", "text"),
    [
        (30.0, "metric", True, 10, "30 kg"),
        (30.0, "imperial", True, 10, "70 lb"),  # 66.1 rounds up to a tidy 70
        (300.0, "imperial", False, 10, "660 lb"),  # 661.4 rounds down to 660
        (61.9, "imperial", True, 5, "140 lb"),  # 136.5 rounds up to a multiple of 5
        (150.0, "imperial", False, 5, "330 lb"),  # 330.7 rounds down
        (61.9, "metric", True, 5, "65 kg"),
    ],
)
def test_weight_limits_are_tidy_and_round_towards_the_safe_side(
    kg: float, units: Any, round_up: bool, step: int, text: str
) -> None:
    assert format_weight_limit(kg, units, round_up=round_up, step=step) == text


def test_height_limits_are_tidy_and_round_towards_the_safe_side() -> None:
    assert format_height_limit(100.0, "imperial", round_up=True) == "3 ft 6 in"  # 39.4 in -> 42
    assert format_height_limit(250.0, "imperial", round_up=False) == "8 ft"  # 98.4 in -> 96
    assert format_height_limit(103.0, "metric", round_up=True) == "105 cm"
    assert format_height_limit(247.0, "metric", round_up=False) == "245 cm"


def test_a_limit_as_shown_is_always_accepted() -> None:
    # 70 lb is the lowest weight shown for imperial users, so typing it must work.
    assert problems(weight_kg=lb_to_kg(70), height_cm=100.0, goal_weight_kg=None) == {}
    # And so are the shown height limits: 3 ft 6 in and 8 ft.
    assert "height_cm" not in problems(height_cm=3.5 * 30.48, goal_weight_kg=None)
    assert "height_cm" not in problems(height_cm=8 * 30.48, goal_weight_kg=None)
    # 660 lb at 250 cm (BMI 48) is in range for weight; only the BMI rule might object.
    assert "weight_kg" not in problems(
        weight_kg=lb_to_kg(660), height_cm=250.0, goal_weight_kg=None
    )


# --- every problem at once ---------------------------------------------------------------------


def test_all_the_problems_are_reported_together() -> None:
    found = problems(
        age_years=17, height_cm=50.0, weight_kg=900.0, goal_weight_kg=5.0, rate_kg_per_week=-1.0
    )
    assert set(found) == {
        "birth_date",
        "height_cm",
        "weight_kg",
        "goal_weight_kg",
        "rate_kg_per_week",
    }


def test_the_age_messages_are_plain_sentences() -> None:
    assert problems(age_years=17)["birth_date"] == (
        "NutrientLog is for adults: you must be 18 or older."
    )
    assert problems(age_years=101)["birth_date"] == (
        "Please check your birth date: we support ages up to 100."
    )


def test_a_goal_weight_pointing_the_wrong_way_is_rejected() -> None:
    assert "above your current weight" in problems(goal_weight_kg=80.0)["goal_weight_kg"]
    assert "above your current weight" in problems(goal_weight_kg=81.6)["goal_weight_kg"]
    found = problems(goal_weight_kg=90.0, goal=GoalType.LOSE)
    assert "below your current weight" in found["goal_weight_kg"]


def test_maintain_accepts_any_goal_weight_that_is_in_range() -> None:
    assert problems(goal=GoalType.MAINTAIN, goal_weight_kg=60.0) == {}


def test_no_goal_weight_is_fine() -> None:
    assert problems(goal_weight_kg=None) == {}


def test_a_goal_weight_is_not_judged_against_a_height_that_is_itself_wrong() -> None:
    found = problems(height_cm=300.0, goal_weight_kg=200.0)
    assert set(found) == {"height_cm"}  # the goal weight is in range; its BMI can't be judged


def test_someone_who_is_underweight_can_aim_to_gain_towards_a_healthy_weight() -> None:
    # BMI 17 at 6 ft (about 57 kg) wanting 62 kg: allowed. The low-goal rule only applies to losing.
    assert problems(weight_kg=57.0, goal_weight_kg=62.0) == {}


# --- the error carries all the problems ------------------------------------------------------


def test_calculating_a_target_reports_every_range_problem() -> None:
    with pytest.raises(InvalidInputError) as caught:
        calculate_calorie_target(
            sex=Sex.MALE,
            age_years=17,
            height_cm=50,
            weight_kg=80,
            activity=ActivityLevel.MODERATE,
            goal=GoalType.GAIN,
        )
    assert [item.field for item in caught.value.problems] == ["birth_date", "height_cm"]
    assert caught.value.field == "birth_date"
    assert isinstance(caught.value.problems[0], Problem)


def test_bmi_helper() -> None:
    assert bmi(80, 180) == pytest.approx(24.69, abs=0.01)


def test_limits_lists_every_number_the_app_needs() -> None:
    assert set(limits()) == {
        "min_age_years",
        "max_age_years",
        "min_height_cm",
        "max_height_cm",
        "min_weight_kg",
        "max_weight_kg",
        "min_plausible_bmi",
        "max_plausible_bmi",
        "min_goal_bmi_when_losing",
        "max_goal_bmi",
        "max_gain_kg_per_week",
        "max_lose_kg_per_week",
    }


def test_someone_with_a_very_high_weight_can_still_aim_to_lose_or_stay_put() -> None:
    # 6 ft and 170 kg is a BMI of about 50.8. A goal of 155 kg (BMI 46) is still above the top
    # limit for gaining, but it is a sensible step down, so losing and maintaining accept it.
    heavy = {"weight_kg": 170.0, "goal_weight_kg": 155.0}
    assert problems(**heavy, goal=GoalType.LOSE) == {}
    assert problems(**heavy, goal=GoalType.MAINTAIN) == {}
    assert (
        "highest goal weight"
        in problems(weight_kg=170.0, goal_weight_kg=175.0, goal=GoalType.GAIN)["goal_weight_kg"]
    )


SHARED = json.loads(
    (Path(__file__).parents[4] / "shared" / "profile_check_cases.json").read_text(encoding="utf-8")
)


def test_the_limits_match_the_shared_file() -> None:
    assert limits() == SHARED["limits"]


@pytest.mark.parametrize("case", SHARED["cases"], ids=[case["name"] for case in SHARED["cases"]])
def test_check_profile_matches_the_shared_cases(case: dict[str, Any]) -> None:
    found = check_profile(
        age_years=case["age_years"],
        height_cm=case["height_cm"],
        weight_kg=case["weight_kg"],
        goal_weight_kg=case["goal_weight_kg"],
        goal=GoalType(case["goal"]),
        rate_kg_per_week=0.25,
        units=case["units"],
    )
    assert {problem.field: problem.message for problem in found} == case["expected"]
