import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.main import app
from app.models import Food, FoodNutrient, FoodServing
from app.routes import get_food_sources
from app.sources import FoodCandidate, FoodPage, FoodSourceError, ServingCandidate

BASE = "/api/v1/foods"

BAR: dict[str, Any] = {
    "name": "  Peanut   Bar ",
    "brand": "Acme",
    "nutrients": {"calories": 450.0, "protein_g": 20.0, "fat_g": 22.0, "carb_g": 45.0},
    "servings": [{"label": "1 bar", "grams": 68.0}],
}


class FakeSource:
    name = "usda"
    fallback = False

    def __init__(self) -> None:
        self.asked: list[tuple[str, int, int]] = []
        self.has_more = False
        self.error: FoodSourceError | None = None
        self.results: list[FoodCandidate] = []
        self.measures_found: list[ServingCandidate] = []
        self.measures_error: FoodSourceError | None = None

    def measures(self, source_id: str) -> list[ServingCandidate]:
        if self.measures_error is not None:
            raise self.measures_error
        return list(self.measures_found)

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
    app.dependency_overrides[get_food_sources] = lambda: [source]
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
    bar = body["servings"][0]
    assert (bar["label"], bar["grams"]) == ("1 bar", 68.0)
    assert bar["nutrients"]["calories"] == 306.0  # 450 kcal per 100 g, in a 68 g bar
    assert bar["nutrients"]["sodium_mg"] is None  # unknown stays unknown


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
    assert [food["name"] for food in found["results"]] == ["Apples, raw"]
    assert found["results"][0]["source_id"] == "1"
    serving = found["results"][0]["servings"][0]
    assert (serving["label"], serving["grams"]) == ("1 medium (118 g)", 118.0)
    # 52 kcal per 100 g, so 118 g holds 61.4: the app never has to do this maths itself.
    assert serving["nutrients"]["calories"] == 61.4
    assert [(s["name"], s["available"], s["message"]) for s in found["sources"]] == [
        ("usda", True, None)
    ]
    assert isinstance(found["sources"][0]["took_ms"], int)
    assert usda.asked == [("apple", 50, 1)]


def test_a_usda_result_can_be_saved_straight_from_the_search(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    usda.results = [candidate("1", "Apples, raw")]
    found = client.get(f"{BASE}/search", params={"q": "apple"}, headers=auth).json()["results"][0]
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
    assert [food["name"] for food in found["results"]] == ["Apples, fuji"]


def test_a_usda_failure_still_returns_saved_foods_with_a_message(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    save(client, auth, name="Apple pie")
    usda.error = FoodSourceError("The USDA food database is busy (too many searches). Try later.")
    response = client.get(f"{BASE}/search", params={"q": "apple"}, headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert len(body["saved"]) == 1 and body["results"] == []
    assert body["sources"][0]["available"] is False
    assert "busy" in body["sources"][0]["message"]


def test_search_works_without_a_usda_key(client: TestClient, auth: dict[str, str]) -> None:
    app.dependency_overrides[get_food_sources] = lambda: []
    save(client, auth)
    body = client.get(f"{BASE}/search", params={"q": "peanut"}, headers=auth).json()
    assert len(body["saved"]) == 1
    assert body["sources"] == [] and body["results"] == []


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
    assert first["has_more"] is True and len(first["saved"]) == 1

    usda.results = [candidate("2", "Apples, fuji")]
    usda.has_more = False
    second = client.get(f"{BASE}/search", params={"q": "apple", "page": 2}, headers=auth).json()
    assert second["saved"] == []
    assert [food["name"] for food in second["results"]] == ["Apples, fuji"]
    assert second["has_more"] is False
    assert usda.asked[-1] == ("apple", 50, 2)


@pytest.mark.parametrize("page", [0, -1, 101])
def test_page_must_be_between_1_and_100(
    client: TestClient, auth: dict[str, str], usda: FakeSource, page: int
) -> None:
    response = client.get(f"{BASE}/search", params={"q": "apple", "page": page}, headers=auth)
    assert response.status_code == 422


class SecondSource(FakeSource):
    name = "off"
    fallback = True


def candidate_from(
    source: str, source_id: str, name: str, barcode: str | None, kcal: float
) -> FoodCandidate:
    return FoodCandidate(
        source=source,
        source_id=source_id,
        name=name,
        brand="Clif Bar",
        barcode=barcode,
        nutrients={"calories": kcal, "protein_g": None},
        servings=[ServingCandidate("1 bar (68 g)", 68.0)],
    )


@pytest.fixture
def two_sources(client: TestClient) -> Iterator[tuple[FakeSource, SecondSource]]:
    first, second = FakeSource(), SecondSource()
    app.dependency_overrides[get_food_sources] = lambda: [first, second]
    yield first, second


def test_results_from_every_source_are_ranked_as_one_list(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    usda, off = two_sources
    usda.results = [candidate("1", "Peanut Butter, smooth")]
    off.results = [candidate_from("off", "9", "Energy Bar, Peanut Butter", "0000009", 382.0)]
    body = client.get(f"{BASE}/search", params={"q": "peanut butter clif bar"}, headers=auth).json()
    assert [food["name"] for food in body["results"]] == [
        "Energy Bar, Peanut Butter",
        "Peanut Butter, smooth",
    ]
    assert [item["name"] for item in body["sources"]] == ["usda", "off"]


def test_the_same_barcode_from_two_sources_is_listed_once_keeping_the_fuller_one(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    usda, off = two_sources
    thin = candidate_from("usda", "1", "Clif Bar Peanut Butter", "0722252100108", 380.0)
    full = FoodCandidate(
        **{
            **thin.__dict__,
            "source": "off",
            "source_id": "722252100108",
            "barcode": "722252100108",
            "nutrients": {"calories": 382.0, "protein_g": 14.7},
        }
    )
    usda.results, off.results = [thin], [full]
    body = client.get(f"{BASE}/search", params={"q": "clif bar"}, headers=auth).json()
    assert len(body["results"]) == 1
    assert body["results"][0]["source"] == "off"


def test_one_source_failing_leaves_the_other_results_and_says_which_failed(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    usda, off = two_sources
    usda.error = FoodSourceError("The USDA food database took too long to answer.")
    off.results = [candidate_from("off", "9", "Clif Bar Peanut Butter", "9", 382.0)]
    body = client.get(f"{BASE}/search", params={"q": "clif bar"}, headers=auth).json()
    assert [food["source_id"] for food in body["results"]] == ["9"]
    assert [(s["name"], s["available"]) for s in body["sources"]] == [
        ("usda", False),
        ("off", True),
    ]
    assert "too long" in body["sources"][0]["message"]


def test_an_open_food_facts_result_can_be_saved_and_is_then_not_offered_again(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    _, off = two_sources
    off.results = [candidate_from("off", "9", "Clif Bar Peanut Butter", "9", 382.0)]
    found = client.get(f"{BASE}/search", params={"q": "clif bar"}, headers=auth).json()
    saved = client.post(BASE, headers=auth, json=found["results"][0])
    assert saved.status_code == 201 and saved.json()["source"] == "off"
    again = client.get(f"{BASE}/search", params={"q": "clif bar"}, headers=auth).json()
    assert again["results"] == []
    assert [food["name"] for food in again["saved"]] == ["Clif Bar Peanut Butter"]


def test_the_fallback_source_is_skipped_when_the_main_one_found_enough_close_matches(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    usda, off = two_sources
    kinds = ["Cavendish", "Plantain", "Red", "Baby", "Dried", "Frozen"]
    usda.results = [candidate(str(n), f"Banana {kind}") for n, kind in enumerate(kinds)]
    off.results = [candidate_from("off", "9", "Banana", "9", 89.0)]
    body = client.get(f"{BASE}/search", params={"q": "banana"}, headers=auth).json()
    assert off.asked == []
    assert [item["name"] for item in body["sources"]] == ["usda"]
    assert len(body["results"]) == 6


def test_the_fallback_source_is_asked_when_there_are_few_close_matches(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    usda, off = two_sources
    usda.results = [candidate("1", "Banana variety")]
    off.results = [candidate_from("off", "9", "Banana", "9", 89.0)]
    client.get(f"{BASE}/search", params={"q": "banana"}, headers=auth)
    assert off.asked == [("banana", 50, 1)]


def test_the_fallback_source_is_never_asked_for_later_pages(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    _, off = two_sources
    client.get(f"{BASE}/search", params={"q": "banana", "page": 2}, headers=auth)
    assert off.asked == []


def test_a_fast_search_never_waits_for_the_fallback_and_says_more_is_coming(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    usda, off = two_sources
    usda.results = [candidate("1", "Banana variety")]  # few close matches: the fallback is wanted
    off.results = [candidate_from("off", "9", "Banana", "9", 89.0)]
    body = client.get(
        f"{BASE}/search", params={"q": "banana", "scope": "fast"}, headers=auth
    ).json()
    assert off.asked == []
    assert [item["name"] for item in body["sources"]] == ["usda"]
    assert [food["source_id"] for food in body["results"]] == ["1"]
    assert body["more_coming"] is True
    # The follow-up (default scope) adds the slower database to the same ranked list.
    full = client.get(f"{BASE}/search", params={"q": "banana"}, headers=auth).json()
    assert off.asked == [("banana", 50, 1)]
    assert {food["source_id"] for food in full["results"]} == {"1", "9"}
    assert full["more_coming"] is False


def test_a_fast_search_says_nothing_more_is_coming_when_the_fallback_is_not_wanted(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    usda, off = two_sources
    kinds = ["Cavendish", "Plantain", "Red", "Baby", "Dried", "Frozen"]
    usda.results = [candidate(str(n), f"Banana {kind}") for n, kind in enumerate(kinds)]
    body = client.get(
        f"{BASE}/search", params={"q": "banana", "scope": "fast"}, headers=auth
    ).json()
    assert body["more_coming"] is False and off.asked == []


def test_a_fast_search_for_a_long_query_also_says_more_is_coming(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    usda, off = two_sources
    usda.results = [candidate(str(n), f"Peanut butter clif bar {n}") for n in range(8)]
    body = client.get(
        f"{BASE}/search", params={"q": "peanut butter clif bar", "scope": "fast"}, headers=auth
    ).json()
    assert body["more_coming"] is True and off.asked == []


def test_more_is_never_coming_when_there_is_no_fallback_database(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    usda.results = [candidate("1", "Banana variety")]
    body = client.get(
        f"{BASE}/search", params={"q": "banana", "scope": "fast"}, headers=auth
    ).json()
    assert body["more_coming"] is False


def test_more_is_never_coming_after_page_one(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    usda, _ = two_sources
    usda.results = [candidate("1", "Banana variety")]
    body = client.get(
        f"{BASE}/search", params={"q": "banana", "scope": "fast", "page": 2}, headers=auth
    ).json()
    assert body["more_coming"] is False


def test_an_unknown_scope_is_rejected(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    reply = client.get(f"{BASE}/search", params={"q": "banana", "scope": "slow"}, headers=auth)
    assert reply.status_code == 422


def test_the_same_product_in_several_pack_sizes_is_listed_once(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    def jif(source_id: str, name: str) -> FoodCandidate:
        return FoodCandidate(
            "usda",
            source_id,
            name,
            "Jif",
            None,
            {"calories": 576.0},
            [ServingCandidate("2 tbsp (33 g)", 33.0)],
        )

    usda.results = [
        jif("1", "JIF 12 OUNCE CREAMY PEANUT BUTTER Each"),
        jif("2", "JIF 16 OUNCE CREAMY PEANUT BUTTER Each"),
        jif("3", "JIF 16 OUNCE CRUNCHY PEANUT BUTTER Each"),
    ]
    body = client.get(f"{BASE}/search", params={"q": "jif peanut butter"}, headers=auth).json()
    assert [food["source_id"] for food in body["results"]] == ["1", "3"]


def test_results_that_share_no_word_with_the_search_are_left_out(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    usda.results = [candidate("1", "Egg, whole, raw"), candidate("2", "Mayonnaise")]
    body = client.get(f"{BASE}/search", params={"q": "egg"}, headers=auth).json()
    assert [food["name"] for food in body["results"]] == ["Egg, whole, raw"]


def test_the_fallback_source_is_also_asked_for_a_long_product_style_query(
    client: TestClient, auth: dict[str, str], two_sources: tuple[FakeSource, SecondSource]
) -> None:
    usda, off = two_sources
    # Plenty of close matches, but a query that names one specific product ("brand + flavour").
    flavours = ["smooth", "crunchy", "salted", "honey", "dark", "mini", "double", "classic"]
    usda.results = [
        candidate(str(n), f"Peanut butter clif bar {kind}") for n, kind in enumerate(flavours)
    ]
    off.results = [candidate_from("off", "9", "Crunchy Peanut Butter", "9", 382.0)]
    body = client.get(f"{BASE}/search", params={"q": "peanut butter clif bar"}, headers=auth).json()
    assert off.asked == [("peanut butter clif bar", 50, 1)]
    assert "9" in [food["source_id"] for food in body["results"]]


def test_a_plain_food_listed_in_several_usda_datasets_is_shown_once(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    def plain(source_id: str, kcal: float) -> FoodCandidate:
        return FoodCandidate(
            "usda", source_id, "Broccoli, raw", None, None, {"calories": kcal}, [], is_generic=True
        )

    usda.results = [plain("1", 39.0), plain("2", 31.0), plain("3", 34.0)]
    body = client.get(f"{BASE}/search", params={"q": "broccoli"}, headers=auth).json()
    assert [food["source_id"] for food in body["results"]] == ["1"]


# --- measures and amounts ---

MEASURES = "/api/v1/foods/measures"
TO_GRAMS = "/api/v1/amounts/to-grams"


def test_measures_come_from_the_chosen_database(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    usda.measures_found = [ServingCandidate("1 cup (125 g)", 125.0)]
    reply = client.get(f"{MEASURES}?source=usda&source_id=250", headers=auth)
    assert reply.status_code == 200
    assert reply.json() == {"servings": [{"label": "1 cup (125 g)", "grams": 125.0}]}


def test_measures_for_a_database_that_is_off_or_down(
    client: TestClient, auth: dict[str, str], usda: FakeSource
) -> None:
    assert client.get(f"{MEASURES}?source=off&source_id=1", headers=auth).status_code == 404

    usda.measures_error = FoodSourceError("The USDA food database had a problem. Try again later.")
    reply = client.get(f"{MEASURES}?source=usda&source_id=1", headers=auth)
    assert reply.status_code == 502 and "Try again later" in reply.json()["detail"]


def test_measures_and_amounts_need_a_token(client: TestClient) -> None:
    assert client.get(f"{MEASURES}?source=usda&source_id=1").status_code == 401
    assert client.post(TO_GRAMS, json={"text": "1 g"}).status_code == 401


def test_an_amount_becomes_grams(client: TestClient, auth: dict[str, str]) -> None:
    body = {
        "text": "1/2 cup flour",
        "food_name": "Flour",
        "servings": [{"label": "1 cup (125 g)", "grams": 125}],
    }
    reply = client.post(TO_GRAMS, headers=auth, json=body)
    assert reply.status_code == 200
    assert reply.json() == {"grams": 62.5, "quantity": 0.5, "unit": "cup"}
    assert client.post(TO_GRAMS, headers=auth, json={"text": "8 oz"}).json()["grams"] == 226.8


def test_an_amount_that_cannot_be_worked_out_says_why(
    client: TestClient, auth: dict[str, str]
) -> None:
    density = client.post(TO_GRAMS, headers=auth, json={"text": "1 cup", "food_name": "Clif Bar"})
    assert density.status_code == 422 and density.json()["code"] == "unknown_density"
    assert density.json()["errors"][0]["field"] == "text"
    serving = client.post(TO_GRAMS, headers=auth, json={"text": "1 bowl"})
    assert serving.status_code == 422 and serving.json()["code"] == "unknown_serving"
    typo = client.post(TO_GRAMS, headers=auth, json={"text": "flour"})
    assert typo.status_code == 422 and typo.json()["code"] == "bad_amount"
    assert client.post(TO_GRAMS, headers=auth, json={"text": ""}).status_code == 422
