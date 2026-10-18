import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.integration.test_users_profile_goals import PROFILE

LOG = "/api/v1/log"
FOODS = "/api/v1/foods"

# 450 kcal and 20 g protein per 100 g; the reference profile's target is 3034 kcal.
BAR: dict[str, Any] = {
    "name": "Peanut Bar",
    "nutrients": {"calories": 450.0, "protein_g": 20.0},
    "servings": [{"label": "1 bar", "grams": 68.0}],
}


@pytest.fixture
def other_auth(client: TestClient) -> dict[str, str]:
    return {"Authorization": f"Bearer {client.post('/api/v1/users').json()['token']}"}


def save_food(client: TestClient, auth: dict[str, str]) -> str:
    return str(client.post(FOODS, headers=auth, json=BAR).json()["id"])


def eat(client: TestClient, auth: dict[str, str], food_id: str, grams: float, **extra: Any) -> Any:
    body = {"food_id": food_id, "grams": grams, **extra}
    return client.post(LOG, headers=auth, json=body)


def test_every_log_route_needs_a_token(client: TestClient) -> None:
    some_id = str(uuid.uuid4())
    assert client.get(LOG).status_code == 401
    assert client.post(LOG, json={"food_id": some_id, "grams": 5}).status_code == 401
    assert client.delete(f"{LOG}/{some_id}").status_code == 401


def test_an_entry_is_scaled_from_the_food(client: TestClient, auth: dict[str, str]) -> None:
    food_id = save_food(client, auth)
    reply = eat(client, auth, food_id, 136, amount_text="  2 bars ")
    assert reply.status_code == 201
    body = reply.json()
    assert body["food_name"] == "Peanut Bar" and body["amount_text"] == "2 bars"
    assert body["nutrients"]["calories"] == pytest.approx(612.0)
    assert body["nutrients"]["protein_g"] == pytest.approx(27.2)
    assert body["nutrients"]["sodium_mg"] is None  # unknown stays unknown


def test_the_day_adds_up_and_shows_calories_left(client: TestClient, auth: dict[str, str]) -> None:
    assert client.put("/api/v1/users/me/profile", headers=auth, json=PROFILE).status_code == 200
    food_id = save_food(client, auth)
    eat(client, auth, food_id, 100)
    eat(client, auth, food_id, 200)
    day = client.get(LOG, headers=auth).json()
    assert day["date"] == "2026-10-08"
    assert len(day["entries"]) == 2
    assert day["totals"]["calories"] == pytest.approx(1350.0)
    assert day["goal_calories"] == 3034
    assert day["remaining_calories"] == pytest.approx(3034 - 1350)


def test_an_empty_day_with_no_goal_yet(client: TestClient, auth: dict[str, str]) -> None:
    day = client.get(LOG, headers=auth).json()
    assert day["entries"] == [] and day["totals"]["calories"] is None
    assert day["goal_calories"] is None and day["remaining_calories"] is None


def test_going_over_the_target_is_negative(client: TestClient, auth: dict[str, str]) -> None:
    client.put("/api/v1/users/me/profile", headers=auth, json=PROFILE)
    food_id = save_food(client, auth)
    eat(client, auth, food_id, 1000)  # 4500 kcal
    assert client.get(LOG, headers=auth).json()["remaining_calories"] == pytest.approx(-1466)


def test_days_are_kept_apart(client: TestClient, auth: dict[str, str]) -> None:
    food_id = save_food(client, auth)
    eat(client, auth, food_id, 100)
    eat(client, auth, food_id, 50, logged_on="2026-10-07")
    today = client.get(LOG, headers=auth).json()
    yesterday = client.get(f"{LOG}?date=2026-10-07", headers=auth).json()
    assert today["totals"]["calories"] == pytest.approx(450)
    assert yesterday["totals"]["calories"] == pytest.approx(225)


def test_the_day_follows_the_persons_timezone(client: TestClient, auth: dict[str, str]) -> None:
    # 12:00 UTC on Oct 8 is already Oct 9 in Auckland.
    profile = {**PROFILE, "timezone": "Pacific/Auckland", "birth_date": "1996-10-09"}
    client.put("/api/v1/users/me/profile", headers=auth, json=profile)
    food_id = save_food(client, auth)
    assert eat(client, auth, food_id, 100).json()["logged_on"] == "2026-10-09"
    assert client.get(LOG, headers=auth).json()["date"] == "2026-10-09"


def test_a_mistake_can_be_removed(client: TestClient, auth: dict[str, str]) -> None:
    food_id = save_food(client, auth)
    entry_id = eat(client, auth, food_id, 100).json()["id"]
    assert client.delete(f"{LOG}/{entry_id}", headers=auth).status_code == 204
    assert client.get(LOG, headers=auth).json()["entries"] == []
    assert client.delete(f"{LOG}/{entry_id}", headers=auth).status_code == 404


def test_one_person_cannot_see_use_or_remove_anothers(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    food_id = save_food(client, auth)
    entry_id = eat(client, auth, food_id, 100).json()["id"]
    # They don't see it, can't remove it, and can't log a food that isn't theirs.
    assert client.get(LOG, headers=other_auth).json()["entries"] == []
    assert client.delete(f"{LOG}/{entry_id}", headers=other_auth).status_code == 404
    assert client.get(LOG, headers=auth).json()["entries"][0]["id"] == entry_id
    stolen = eat(client, other_auth, food_id, 100)
    assert stolen.status_code == 422 and stolen.json()["errors"][0]["field"] == "food_id"


@pytest.mark.parametrize(
    ("changes", "field"),
    [
        ({"grams": 0}, "grams"),
        ({"grams": -5}, "grams"),
        ({"grams": 10_000_000}, "grams"),
        ({"logged_on": "2030-01-01"}, "logged_on"),
        ({"amount_text": "x" * 101}, "amount_text"),
    ],
)
def test_bad_entries_are_rejected_with_the_field(
    client: TestClient, auth: dict[str, str], changes: dict[str, Any], field: str
) -> None:
    food_id = save_food(client, auth)
    reply = eat(client, auth, food_id, **{"grams": 100, **changes})
    assert reply.status_code == 422
    assert reply.json()["errors"][0]["field"] == field
