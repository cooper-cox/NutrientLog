import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_food_source
from app.integrations.base import FoodCandidate, FoodPage, FoodSourceError, ServingCandidate
from app.main import app
from app.models import Food, FoodNutrient, FoodServing

BASE = "/api/v1/foods"

BAR: dict[str, Any] = {
    "name": "  Peanut   Bar ",
    "brand": "Acme",
    "nutrients": {"calories": 450.0, "protein_g": 20.0, "fat_g": 22.0, "carb_g": 45.0},
    "servings": [{"label": "1 bar", "grams": 68.0}],
}


class FakeSource:
    name = "usda"

    def __init__(self) -> None:
        self.asked: list[tuple[str, int, int]] = []
        self.has_more = False
        self.error: FoodSourceError | None = None
        self.results: list[FoodCandidate] = []

    def search(self, query: str, limit: int, page: int = 1) -> FoodPage:
        self.asked.append((query, limit, page))
        if self.error is not None:
            raise self.error
        return FoodPage(self.results, self.has_more)


def candidate(source_id: str, name: str) -> FoodCandidate:
    nutrients: dict[str, float | None] = {"calories": 52.0, "protein_g": 0.3}
    return FoodCandidate(
        source="usda",
        source_id=source_id,
        name=name,
        brand=None,
        barcode=None,
        nutrients=nutrients,
        servings=[ServingCandidate("1 medium (118 g)", 118.0)],
    )


@pytest.fixture
def usda(client: TestClient) -> Iterator[FakeSource]:
    source = FakeSource()
    app.dependency_overrides[get_food_source] = lambda: source
    yield source


@pytest.fixture
def other_auth(client: TestClient) -> dict[str, str]:
    return {"Authorization": f"Bearer {client.post('/api/v1/users').json()['token']}"}


def save(client: TestClient, auth: dict[str, str], **changes: Any) -> Any:
    return client.post(BASE, headers=auth, json={**BAR, **changes})


def test_all_food_routes_need_a_token(client: TestClient) -> None:
    assert client.post(BASE, json=BAR).status_code == 401
    assert client.get(f"{BASE}/search?q=oat").status_code == 401
    assert client.get(f"{BASE}/00000000-0000-0000-0000-000000000000").status_code == 401


def test_a_manual_food_is_saved_and_tidied(client: TestClient, auth: dict[str, str]) -> None:
    response = save(client, auth)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Peanut Bar"
    assert body["source"] == "manual" and body["source_id"] is None
    assert body["nutrients"]["calories"] == 450.0
    assert body["servings"] == [{"label": "1 bar", "grams": 68.0}]


def test_nutrients_left_out_come_back_as_unknown_not_zero(
    client: TestClient, auth: dict[str, str]
) -> None:
    nutrients = save(client, auth).json()["nutrients"]
    assert nutrients["sodium_mg"] is None
    assert nutrients["fiber_g"] is None
    assert "vitamin_k_ug" in nutrients


def test_a_zero_is_kept_as_zero(client: TestClient, auth: dict[str, str]) -> None:
    body = save(client, auth, nutrients={"calories": 0.0, "sodium_mg": 0.0}).json()
    assert body["nutrients"]["sodium_mg"] == 0.0


def test_a_saved_food_can_be_read_back(client: TestClient, auth: dict[str, str]) -> None:
    saved = save(client, auth).json()
    again = client.get(f"{BASE}/{saved['id']}", headers=auth)
    assert again.status_code == 200
    assert again.json() == saved


def test_servings_keep_their_order(client: TestClient, auth: dict[str, str]) -> None:
    servings = [
        {"label": "b", "grams": 2.0},
        {"label": "a", "grams": 1.0},
        {"label": "c", "grams": 3.0},
    ]
    body = save(client, auth, servings=servings).json()
    assert [item["label"] for item in body["servings"]] == ["b", "a", "c"]


def test_a_missing_food_is_a_404(client: TestClient, auth: dict[str, str]) -> None:
    response = client.get(f"{BASE}/00000000-0000-0000-0000-000000000000", headers=auth)
    assert response.status_code == 404


def test_other_people_cannot_see_my_foods(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    food_id = save(client, auth).json()["id"]
    assert client.get(f"{BASE}/{food_id}", headers=other_auth).status_code == 404


def test_every_problem_comes_back_at_once_under_its_own_field(
    client: TestClient, auth: dict[str, str]
) -> None:
    response = client.post(
        BASE,
        headers=auth,
        json={
            "name": " ",
            "nutrients": {"protein_g": 900},
            "servings": [{"label": "", "grams": 0}],
        },
    )
    assert response.status_code == 422
    fields = {item["field"] for item in response.json()["errors"]}
    assert {"name", "nutrients.calories", "nutrients.protein_g", "servings.0.label"} <= fields


def test_nothing_is_saved_when_the_food_is_invalid(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    before = db_session.scalar(select(func.count()).select_from(Food))
    save(client, auth, name="")
    assert db_session.scalar(select(func.count()).select_from(Food)) == before


def test_a_usda_food_needs_its_id(client: TestClient, auth: dict[str, str]) -> None:
    response = save(client, auth, source="usda")
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "source_id"


def test_an_unknown_source_is_rejected(client: TestClient, auth: dict[str, str]) -> None:
    assert save(client, auth, source="made_up").status_code == 422


def test_saving_the_same_usda_food_twice_gives_the_first_one(
    client: TestClient, auth: dict[str, str]
) -> None:
    first = save(client, auth, source="usda", source_id="111")
    second = save(client, auth, source="usda", source_id="111")
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["id"] == second.json()["id"]


def test_two_people_can_each_save_the_same_usda_food(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    mine = save(client, auth, source="usda", source_id="111")
    theirs = save(client, other_auth, source="usda", source_id="111")
    assert theirs.status_code == 201
    assert mine.json()["id"] != theirs.json()["id"]


def test_search_finds_my_saved_foods_by_any_word_in_name_or_brand(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    save(client, auth)
    save(client, auth, name="Banana", brand=None)
    for query in ("peanut", "ACME", "bar peanut", "acme  bar"):
        found = client.get(f"{BASE}/search", params={"q": query}, headers=auth).json()
        assert [food["name"] for food in found["saved"]] == ["Peanut Bar"], query
    nothing = client.get(f"{BASE}/search", params={"q": "zzz"}, headers=auth).json()
    assert nothing["saved"] == []


def test_search_treats_percent_and_underscore_as_plain_characters(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    save(client, auth, name="100% Juice")
    save(client, auth, name="Apple")
    found = client.get(f"{BASE}/search", params={"q": "0%"}, headers=auth).json()
    assert [food["name"] for food in found["saved"]] == ["100% Juice"]
    assert client.get(f"{BASE}/search", params={"q": "a_"}, headers=auth).json()["saved"] == []


def test_names_starting_with_the_first_word_come_first(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    for name in ("Toasted Oat Cereal", "Oats", "Cooked oat bran"):
        save(client, auth, name=name)
    found = client.get(f"{BASE}/search", params={"q": "oat"}, headers=auth).json()
    # Names that start with the word first, then the rest alphabetically.
    assert [food["name"] for food in found["saved"]] == [
        "Oats",
        "Cooked oat bran",
        "Toasted Oat Cereal",
    ]


def test_search_never_shows_other_peoples_foods(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str], usda: FakeSource
) -> None:
    save(client, other_auth)
    found = client.get(f"{BASE}/search", params={"q": "peanut"}, headers=auth).json()
    assert found["saved"] == []


def test_search_adds_usda_results_after_the_saved_ones(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    save(client, auth, name="Apple pie")
    usda.results = [candidate("1", "Apples, raw")]
    found = client.get(f"{BASE}/search", params={"q": "  apple "}, headers=auth).json()
    assert [food["name"] for food in found["saved"]] == ["Apple pie"]
    assert [food["name"] for food in found["usda"]] == ["Apples, raw"]
    assert found["usda"][0]["source_id"] == "1"
    assert found["usda"][0]["servings"] == [{"label": "1 medium (118 g)", "grams": 118.0}]
    assert found["usda_available"] is True and found["usda_message"] is None
    assert usda.asked == [("apple", 50, 1)]


def test_a_usda_result_can_be_saved_straight_from_the_search(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    usda.results = [candidate("1", "Apples, raw")]
    found = client.get(f"{BASE}/search", params={"q": "apple"}, headers=auth).json()["usda"][0]
    saved = client.post(BASE, headers=auth, json=found)
    assert saved.status_code == 201
    assert saved.json()["nutrients"]["calories"] == 52.0
    assert saved.json()["source_id"] == "1"


def test_usda_results_already_saved_are_not_listed_twice(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    save(client, auth, name="Apples, raw", source="usda", source_id="1")
    usda.results = [candidate("1", "Apples, raw"), candidate("2", "Apples, fuji")]
    found = client.get(f"{BASE}/search", params={"q": "apple"}, headers=auth).json()
    assert [food["name"] for food in found["saved"]] == ["Apples, raw"]
    assert [food["name"] for food in found["usda"]] == ["Apples, fuji"]


def test_a_usda_failure_still_returns_saved_foods_with_a_message(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    save(client, auth, name="Apple pie")
    usda.error = FoodSourceError("The USDA food database is busy (too many searches). Try later.")
    response = client.get(f"{BASE}/search", params={"q": "apple"}, headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert len(body["saved"]) == 1 and body["usda"] == []
    assert body["usda_available"] is True
    assert "busy" in body["usda_message"]


def test_search_works_without_a_usda_key(client: TestClient, auth: dict[str, str]) -> None:
    app.dependency_overrides[get_food_source] = lambda: None
    save(client, auth)
    body = client.get(f"{BASE}/search", params={"q": "peanut"}, headers=auth).json()
    assert len(body["saved"]) == 1
    assert body["usda_available"] is False and body["usda"] == []


@pytest.mark.parametrize("query", ["", " ", "a", "x" * 101])
def test_search_text_must_be_2_to_100_characters(
    client: TestClient, auth: dict[str, str], usda: FakeSource, query: str
) -> None:
    response = client.get(f"{BASE}/search", params={"q": query}, headers=auth)
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "q"
    assert usda.asked == []


def test_deleting_a_food_removes_its_nutrients_and_servings(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    saved = save(client, auth).json()
    food = db_session.get(Food, uuid.UUID(saved["id"]))
    assert food is not None
    db_session.delete(food)
    db_session.flush()
    rows = db_session.scalar(select(func.count()).select_from(FoodNutrient))
    assert rows == 0
    assert db_session.scalar(select(func.count()).select_from(FoodServing)) == 0


def test_show_more_asks_for_the_next_usda_page_and_skips_saved_foods(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    save(client, auth, name="Apple pie")
    usda.results = [candidate("1", "Apples, raw")]
    usda.has_more = True
    first = client.get(f"{BASE}/search", params={"q": "apple"}, headers=auth).json()
    assert first["usda_has_more"] is True and len(first["saved"]) == 1

    usda.results = [candidate("2", "Apples, fuji")]
    usda.has_more = False
    second = client.get(f"{BASE}/search", params={"q": "apple", "page": 2}, headers=auth).json()
    assert second["saved"] == []
    assert [food["name"] for food in second["usda"]] == ["Apples, fuji"]
    assert second["usda_has_more"] is False
    assert usda.asked[-1] == ("apple", 50, 2)


@pytest.mark.parametrize("page", [0, -1, 101])
def test_page_must_be_between_1_and_100(
    client: TestClient, auth: dict[str, str], usda: FakeSource, page: int
) -> None:
    response = client.get(f"{BASE}/search", params={"q": "apple", "page": page}, headers=auth)
    assert response.status_code == 422
