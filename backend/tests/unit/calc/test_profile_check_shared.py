"""The checks must give the same answers, with the same wording, as the phone app's copy.

Both sides read shared/profile_check_cases.json. If you change a check or a message, update that
file; the app's test (mobile/src/features/onboarding/checks.test.ts) will then show what the app
needs to change too.
"""

import json
from pathlib import Path
from typing import Any

import pytest

from app.calc.calorie_target import GoalType
from app.calc.profile_check import check_profile, limits

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
