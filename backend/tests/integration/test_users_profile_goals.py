from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Goal

# Reference person on FIXED_NOW (2026-10-08): a 30-year-old man, 80 kg, 180 cm, moderately
# active, gaining 0.25 kg/week.  BMR 1780 -> maintenance 2759 -> +275 = 3034 kcal.
# Macros: protein 144 g, fat 84 g, carbs 425 g (see tests/unit/calc/test_macros.py).
PROFILE: dict[str, Any] = {
    "name": "Cooper",
    "sex": "male",
    "birth_date": "1996-10-08",
    "height_cm": 180,
    "weight_kg": 80,
    "goal_weight_kg": 85,
    "activity_level": "moderate",
    "goal_type": "gain",
    "rate_kg_per_week": 0.25,
    "timezone": "UTC",
    "unit_preference": "imperial",
}


def put_profile(client: TestClient, auth: dict[str, str], **changes: Any) -> Any:
    return client.put("/api/v1/users/me/profile", headers=auth, json={**PROFILE, **changes})


# --- creating users and logging in ---------------------------------------------------------


def test_create_user_returns_an_id_and_a_token(client: TestClient) -> None:
    response = client.post("/api/v1/users")
    assert response.status_code == 201
    body = response.json()
    assert body["user_id"]
    assert len(body["token"]) >= 40


def test_each_user_gets_a_different_token(client: TestClient) -> None:
    first = client.post("/api/v1/users").json()
    second = client.post("/api/v1/users").json()
    assert first["user_id"] != second["user_id"]
    assert first["token"] != second["token"]


@pytest.mark.parametrize("path", ["/api/v1/users/me/profile", "/api/v1/goals/current"])
def test_requests_without_a_token_are_rejected(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_a_made_up_token_is_rejected(client: TestClient) -> None:
    response = client.get("/api/v1/users/me/profile", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401


def test_the_token_is_not_stored_in_the_database(
    client: TestClient, db_session: Session, token: str
) -> None:
    from app.models import User

    stored = db_session.scalars(select(User.token_hash)).all()
    assert token not in stored


# --- before onboarding -----------------------------------------------------------------------


def test_new_user_has_no_profile_or_goal_yet(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get("/api/v1/users/me/profile", headers=auth).status_code == 404
    assert client.get("/api/v1/goals/current", headers=auth).status_code == 404


# --- saving the profile ------------------------------------------------------------------------


def test_saving_a_profile_returns_the_profile_and_goal(
    client: TestClient, auth: dict[str, str]
) -> None:
    response = put_profile(client, auth)
    assert response.status_code == 200
    body = response.json()

    assert body["profile"]["name"] == "Cooper"
    assert body["profile"]["unit_preference"] == "imperial"
    assert body["profile"]["weight_kg"] == 80

    goal = body["goal"]
    assert goal["calories"] == 3034
    assert (goal["protein_g"], goal["fat_g"], goal["carb_g"]) == (144, 84, 425)
    assert goal["effective_from"] == "2026-10-08"
    assert goal["bmr"] == pytest.approx(1780)
    assert goal["tdee"] == pytest.approx(2759)
    assert goal["daily_adjustment"] == pytest.approx(275)
    assert goal["rate_was_capped"] is False
    assert goal["floor_was_applied"] is False


def test_profile_and_goal_can_be_read_back(client: TestClient, auth: dict[str, str]) -> None:
    saved = put_profile(client, auth).json()

    profile = client.get("/api/v1/users/me/profile", headers=auth)
    goal = client.get("/api/v1/goals/current", headers=auth)

    assert profile.status_code == 200
    assert profile.json() == saved["profile"]
    assert goal.status_code == 200
    assert goal.json() == saved["goal"]


def test_users_cannot_see_each_others_data(client: TestClient, auth: dict[str, str]) -> None:
    put_profile(client, auth)

    other_token = client.post("/api/v1/users").json()["token"]
    other = {"Authorization": f"Bearer {other_token}"}

    assert client.get("/api/v1/users/me/profile", headers=other).status_code == 404
    assert client.get("/api/v1/goals/current", headers=other).status_code == 404


def test_blank_name_is_saved_as_no_name(client: TestClient, auth: dict[str, str]) -> None:
    body = put_profile(client, auth, name="   ").json()
    assert body["profile"]["name"] is None


def test_extreme_rate_is_capped_and_says_so(client: TestClient, auth: dict[str, str]) -> None:
    goal = put_profile(client, auth, rate_kg_per_week=2.0).json()["goal"]
    assert goal["rate_was_capped"] is True
    assert goal["rate_kg_per_week"] == 0.5
    assert goal["calories"] == 3309  # 2759 + 550


def test_the_calorie_floor_is_applied_and_says_so(client: TestClient, auth: dict[str, str]) -> None:
    goal = put_profile(
        client,
        auth,
        sex="female",
        birth_date="1986-10-08",  # 40 years old
        height_cm=150,
        weight_kg=45,
        goal_weight_kg=42,
        activity_level="sedentary",
        goal_type="lose",
        rate_kg_per_week=0.5,
    ).json()["goal"]
    assert goal["calories"] == 1200
    assert goal["floor_was_applied"] is True


# --- the user's own timezone decides "today" -------------------------------------------------


def test_age_and_start_date_use_the_users_local_date(
    client: TestClient, auth: dict[str, str]
) -> None:
    # FIXED_NOW is noon UTC on Oct 8, so it is still Oct 8 in Los Angeles and in Tokyo's Oct 8 too.
    # A birthday on Oct 9 has not happened yet in either place, so the age is 29, not 30.
    # BMR is 5 higher at 29: 1785 * 1.55 = 2766.75, plus 275 = 3041.75 -> 3042.
    goal = put_profile(client, auth, birth_date="1996-10-09").json()["goal"]
    assert goal["calories"] == 3042
    assert goal["effective_from"] == "2026-10-08"


def test_a_timezone_ahead_of_utc_can_already_be_tomorrow(
    client: TestClient, auth: dict[str, str]
) -> None:
    # Noon UTC on Oct 8 is already 01:00 on Oct 9 in Auckland (NZDT, UTC+13).
    response = put_profile(client, auth, timezone="Pacific/Auckland", birth_date="1996-10-09")
    goal = response.json()["goal"]
    assert goal["effective_from"] == "2026-10-09"
    assert goal["calories"] == 3034  # the Oct 9 birthday has arrived, so the age is 30


# --- history -----------------------------------------------------------------------------------


def test_saving_again_adds_a_new_goal_and_keeps_the_old_one(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    put_profile(client, auth)  # gain 0.25 kg/week -> 3034
    put_profile(client, auth, goal_type="maintain", rate_kg_per_week=0)  # -> 2759

    current = client.get("/api/v1/goals/current", headers=auth).json()
    assert current["calories"] == 2759

    goals_saved = db_session.scalar(select(func.count()).select_from(Goal))
    assert goals_saved == 2


def test_unit_preference_is_remembered(client: TestClient, auth: dict[str, str]) -> None:
    put_profile(client, auth, unit_preference="metric")
    assert client.get("/api/v1/users/me/profile", headers=auth).json()["unit_preference"] == (
        "metric"
    )
    put_profile(client, auth, unit_preference="imperial")
    assert client.get("/api/v1/users/me/profile", headers=auth).json()["unit_preference"] == (
        "imperial"
    )


# --- bad input -------------------------------------------------------------------------------


def test_under_18_is_rejected_with_a_clear_message(
    client: TestClient, auth: dict[str, str]
) -> None:
    response = put_profile(client, auth, birth_date="2010-01-01")
    assert response.status_code == 422
    assert "age" in response.json()["detail"]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("height_cm", 50),
        ("height_cm", 300),
        ("weight_kg", 10),
        ("weight_kg", 500),
    ],
)
def test_out_of_range_body_measurements_are_rejected(
    client: TestClient, auth: dict[str, str], field: str, value: float
) -> None:
    response = put_profile(client, auth, **{field: value})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "changes",
    [
        {"sex": "robot"},
        {"activity_level": "couch"},
        {"goal_type": "explode"},
        {"timezone": "Mars/Olympus"},
        {"height_cm": -1},
        {"weight_kg": 0},
        {"rate_kg_per_week": -0.5},
        {"birth_date": "not-a-date"},
        {"unit_preference": "cubits"},
    ],
)
def test_invalid_survey_answers_are_rejected(
    client: TestClient, auth: dict[str, str], changes: dict[str, Any]
) -> None:
    assert put_profile(client, auth, **changes).status_code == 422


def test_a_rejected_profile_changes_nothing(client: TestClient, auth: dict[str, str]) -> None:
    put_profile(client, auth, birth_date="2010-01-01")
    assert client.get("/api/v1/users/me/profile", headers=auth).status_code == 404
    assert client.get("/api/v1/goals/current", headers=auth).status_code == 404


# --- one error format, goal-weight check, weeks to goal, "prefer not to say" ----------------


def test_validation_errors_name_the_field_and_use_plain_sentences(
    client: TestClient, auth: dict[str, str]
) -> None:
    body = put_profile(client, auth, timezone="Mars/Olympus", height_cm=-1).json()
    assert body["detail"] == "Some answers need fixing."
    problems = {item["field"]: item["message"] for item in body["errors"]}
    assert problems["timezone"] == "unknown timezone; use a name like America/Los_Angeles"
    assert set(problems) == {"timezone", "height_cm"}


def test_range_errors_use_the_same_shape(client: TestClient, auth: dict[str, str]) -> None:
    body = put_profile(client, auth, birth_date="2010-01-01").json()
    assert isinstance(body["detail"], str)
    assert [item["field"] for item in body["errors"]] == ["birth_date"]
    assert "age" in body["errors"][0]["message"]


@pytest.mark.parametrize(
    ("changes", "word"),
    [
        ({"goal_type": "gain", "goal_weight_kg": 75}, "above"),
        ({"goal_type": "gain", "goal_weight_kg": 80}, "above"),
        ({"goal_type": "lose", "goal_weight_kg": 85}, "below"),
    ],
)
def test_a_goal_weight_that_points_the_wrong_way_is_rejected(
    client: TestClient, auth: dict[str, str], changes: dict[str, Any], word: str
) -> None:
    response = put_profile(client, auth, **changes)
    assert response.status_code == 422
    error = response.json()["errors"][0]
    assert error["field"] == "goal_weight_kg"
    assert word in error["message"]
    assert client.get("/api/v1/users/me/profile", headers=auth).status_code == 404


def test_maintain_and_missing_goal_weights_are_accepted(
    client: TestClient, auth: dict[str, str]
) -> None:
    assert put_profile(client, auth, goal_type="maintain", goal_weight_kg=70).status_code == 200
    assert put_profile(client, auth, goal_weight_kg=None).status_code == 200


def test_weeks_to_goal_is_estimated_from_the_rate_used(
    client: TestClient, auth: dict[str, str]
) -> None:
    # 5 kg to gain at 0.25 kg/week = 20 weeks.
    assert put_profile(client, auth).json()["goal"]["weeks_to_goal"] == 20
    # Rate 2.0 is capped to 0.5, so 5 kg takes 10 weeks.
    assert put_profile(client, auth, rate_kg_per_week=2.0).json()["goal"]["weeks_to_goal"] == 10


def test_there_is_no_estimate_without_a_goal_weight_or_a_rate(
    client: TestClient, auth: dict[str, str]
) -> None:
    assert put_profile(client, auth, goal_weight_kg=None).json()["goal"]["weeks_to_goal"] is None
    assert put_profile(client, auth, rate_kg_per_week=0).json()["goal"]["weeks_to_goal"] is None


def test_prefer_not_to_say_uses_the_average_of_the_two_formulas(
    client: TestClient, auth: dict[str, str]
) -> None:
    # Male BMR is 1780 (+5), female 1614 (-161); no answer uses -78 = 1697, their average.
    goal = put_profile(client, auth, sex="no_answer").json()["goal"]
    assert goal["bmr"] == 1697
    assert client.get("/api/v1/users/me/profile", headers=auth).json()["sex"] == "no_answer"


def test_the_current_goal_endpoint_also_has_the_estimate(
    client: TestClient, auth: dict[str, str]
) -> None:
    put_profile(client, auth)
    assert client.get("/api/v1/goals/current", headers=auth).json()["weeks_to_goal"] == 20
