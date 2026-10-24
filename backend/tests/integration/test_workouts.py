from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.integration.test_users_profile_goals import PROFILE

WORKOUTS = "/api/v1/workouts"
LOG = "/api/v1/log"
# The reference profile (80 kg, 180 cm, 30 years old, male) rests at 1780 kcal a day.
RESTING = 1780


@pytest.fixture
def other_auth(client: TestClient) -> dict[str, str]:
    return {"Authorization": f"Bearer {client.post('/api/v1/users').json()['token']}"}


def with_profile(client: TestClient, auth: dict[str, str]) -> None:
    assert client.put("/api/v1/users/me/profile", headers=auth, json=PROFILE).status_code == 200


def walk(client: TestClient, auth: dict[str, str], **extra: Any) -> Any:
    body = {"activity": "walking", "minutes": 60, **extra}
    return client.post(WORKOUTS, headers=auth, json=body)


def test_every_workout_route_needs_a_token(client: TestClient) -> None:
    assert client.get(f"{WORKOUTS}/activities").status_code == 401
    assert client.post(WORKOUTS, json={"activity": "walking", "minutes": 5}).status_code == 401
    some_id = "00000000-0000-0000-0000-000000000000"
    assert client.delete(f"{WORKOUTS}/{some_id}").status_code == 401


def test_the_activity_list_names_activities_and_intensities(
    client: TestClient, auth: dict[str, str]
) -> None:
    body = client.get(f"{WORKOUTS}/activities", headers=auth).json()
    assert {"key": "walking", "label": "Walking"} in body["activities"]
    assert body["intensities"] == ["light", "moderate", "hard"]
    assert body["max_minutes"] == 600


def test_calories_are_estimated_from_the_persons_weight(
    client: TestClient, auth: dict[str, str]
) -> None:
    with_profile(client, auth)
    reply = walk(client, auth)
    assert reply.status_code == 201
    body = reply.json()
    assert body["calories"] == pytest.approx(200)  # (3.5 - 1) x 80 kg x 1 h
    assert body["calories_typed"] is False and body["label"] == "Walking"
    hard = walk(client, auth, activity="running", minutes=30, intensity="hard").json()
    assert hard["calories"] == pytest.approx(8.8 * 80 * 0.5 * 1.25)


def test_typed_calories_are_used_as_they_are(client: TestClient, auth: dict[str, str]) -> None:
    reply = walk(client, auth, calories=315)  # no profile needed when calories are typed
    assert reply.status_code == 201
    assert reply.json()["calories"] == 315 and reply.json()["calories_typed"] is True


def test_an_estimate_needs_a_profile(client: TestClient, auth: dict[str, str]) -> None:
    reply = walk(client, auth)
    assert reply.status_code == 422
    assert reply.json()["errors"][0]["field"] == "calories"


def test_bad_workouts_are_refused_with_the_field_named(
    client: TestClient, auth: dict[str, str]
) -> None:
    with_profile(client, auth)
    unknown = walk(client, auth, activity="quidditch")
    assert unknown.status_code == 422 and unknown.json()["errors"][0]["field"] == "activity"
    long = walk(client, auth, minutes=601)
    assert long.status_code == 422 and long.json()["errors"][0]["field"] == "minutes"
    huge = walk(client, auth, calories=999999)
    assert huge.status_code == 422 and huge.json()["errors"][0]["field"] == "calories"
    far = walk(client, auth, logged_on="2020-01-01")
    assert far.status_code == 422 and far.json()["errors"][0]["field"] == "logged_on"
    assert walk(client, auth, minutes=0).status_code == 422
    assert walk(client, auth, intensity="insane").status_code == 422
    assert client.get(LOG, headers=auth).json()["workouts"] == []


def test_a_day_adds_resting_burn_and_workouts_and_gives_the_balance(
    client: TestClient, auth: dict[str, str]
) -> None:
    with_profile(client, auth)
    walk(client, auth)  # 200 kcal
    day = client.get(LOG, headers=auth).json()
    assert day["burned"] == {"resting": RESTING, "workouts": 200.0, "total": RESTING + 200.0}
    assert [w["activity"] for w in day["workouts"]] == ["walking"]
    # Nothing eaten yet: the balance is a deficit of everything burned.
    assert day["balance_calories"] == pytest.approx(-(RESTING + 200))


def test_the_balance_counts_what_was_eaten(client: TestClient, auth: dict[str, str]) -> None:
    with_profile(client, auth)
    food = client.post(
        "/api/v1/foods",
        headers=auth,
        json={"name": "Rice", "nutrients": {"calories": 130.0}, "servings": []},
    ).json()["id"]
    client.post(LOG, headers=auth, json={"food_id": food, "grams": 2000})  # 2600 kcal
    walk(client, auth)
    day = client.get(LOG, headers=auth).json()
    assert day["balance_calories"] == pytest.approx(2600 - (RESTING + 200))


def test_without_a_profile_only_workouts_count_as_burn(
    client: TestClient, auth: dict[str, str]
) -> None:
    walk(client, auth, calories=250)
    burned = client.get(LOG, headers=auth).json()["burned"]
    assert burned == {"resting": None, "workouts": 250.0, "total": 250.0}


def test_a_workout_belongs_to_its_day(client: TestClient, auth: dict[str, str]) -> None:
    with_profile(client, auth)
    walk(client, auth, logged_on="2026-10-07")
    assert client.get(LOG, headers=auth).json()["workouts"] == []
    yesterday = client.get(f"{LOG}?date=2026-10-07", headers=auth).json()
    assert len(yesterday["workouts"]) == 1 and yesterday["burned"]["workouts"] == 200


def test_a_workout_can_be_removed(client: TestClient, auth: dict[str, str]) -> None:
    with_profile(client, auth)
    workout_id = walk(client, auth).json()["id"]
    assert client.delete(f"{WORKOUTS}/{workout_id}", headers=auth).status_code == 204
    day = client.get(LOG, headers=auth).json()
    assert day["workouts"] == [] and day["burned"]["workouts"] == 0
    assert client.delete(f"{WORKOUTS}/{workout_id}", headers=auth).status_code == 404


def test_nobody_else_can_see_or_remove_a_workout(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    with_profile(client, auth)
    workout_id = walk(client, auth).json()["id"]
    assert client.get(LOG, headers=other_auth).json()["workouts"] == []
    assert client.delete(f"{WORKOUTS}/{workout_id}", headers=other_auth).status_code == 404
    assert len(client.get(LOG, headers=auth).json()["workouts"]) == 1


def test_the_calendar_and_week_show_which_days_had_workouts(
    client: TestClient, auth: dict[str, str]
) -> None:
    with_profile(client, auth)
    walk(client, auth, logged_on="2026-10-05")
    walk(client, auth, activity="running", minutes=20, logged_on="2026-10-05")
    walk(client, auth, activity="weights", minutes=45, logged_on="2026-10-07")
    month = client.get(f"{LOG}/month?month=2026-10", headers=auth).json()
    by_day = {d["date"]: d["workouts"] for d in month["days"]}
    # Inside one test transaction both rows get the same timestamp, so only the set is checked.
    assert sorted(by_day["2026-10-05"]) == ["Run", "Walk"]
    assert by_day["2026-10-07"] == ["Lift"]
    assert by_day["2026-10-06"] == []
    # A day with a workout but no food still shows it.
    assert next(d for d in month["days"] if d["date"] == "2026-10-07")["entries"] == 0
    week = client.get(f"{LOG}/week?end=2026-10-08", headers=auth).json()
    monday = {d["date"]: d["workouts"] for d in week["days"]}["2026-10-05"]
    assert sorted(monday) == ["Run", "Walk"]


def test_the_week_adds_up_workout_minutes_for_each_day(
    client: TestClient, auth: dict[str, str]
) -> None:
    with_profile(client, auth)
    walk(client, auth, minutes=30, logged_on="2026-10-05")
    walk(client, auth, activity="running", minutes=20, logged_on="2026-10-05")
    walk(client, auth, activity="weights", minutes=45, logged_on="2026-10-07")
    week = client.get(f"{LOG}/week?end=2026-10-08", headers=auth).json()
    minutes = {d["date"]: d["workout_minutes"] for d in week["days"]}
    assert minutes["2026-10-05"] == 50
    assert minutes["2026-10-07"] == 45
    assert minutes["2026-10-06"] == 0


def test_other_peoples_workouts_never_show_on_my_calendar(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    with_profile(client, auth)
    walk(client, auth, logged_on="2026-10-05")
    month = client.get(f"{LOG}/month?month=2026-10", headers=other_auth).json()
    assert all(d["workouts"] == [] for d in month["days"])
