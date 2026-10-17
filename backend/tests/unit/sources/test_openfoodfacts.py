from typing import Any

import httpx
import pytest

from app.calc.nutrients import KEYS
from app.sources import FoodSourceError
from app.sources.openfoodfacts import (
    USER_AGENT,
    OpenFoodFactsClient,
    map_nutrients,
    map_product,
)

PRODUCT: dict[str, Any] = {
    "code": "722252100108",
    "product_name": "Peanut Butter Energy Bar",
    "brands": "Clif Bar, Clif",
    "serving_size": "68 g",
    "serving_quantity": 68,
    "nutriments": {
        "energy-kcal_100g": 382,
        "proteins_100g": 14.7,
        "fat_100g": 8.8,
        "carbohydrates_100g": 66.2,
        "sodium_100g": 0.25,
        "calcium_100g": 0.1,
        "vitamin-d_100g": 0.0000025,
    },
}


def test_nutrients_are_converted_from_grams_into_our_units() -> None:
    mapped = map_nutrients(PRODUCT["nutriments"])
    assert list(mapped) == list(KEYS)
    assert mapped["calories"] == 382.0
    assert mapped["sodium_mg"] == 250.0
    assert mapped["calcium_mg"] == 100.0
    assert mapped["vitamin_d_ug"] == pytest.approx(2.5)
    assert mapped["zinc_mg"] is None


def test_energy_in_kilojoules_is_used_when_kcal_is_missing() -> None:
    assert map_nutrients({"energy_100g": 418.4})["calories"] == 100.0


def test_absurd_and_non_numeric_values_become_unknown() -> None:
    mapped = map_nutrients(
        {"energy-kcal_100g": 5000, "proteins_100g": 250, "fat_100g": "lots", "fiber_100g": True}
    )
    assert mapped["calories"] is None
    assert mapped["protein_g"] is None
    assert mapped["fat_g"] is None
    assert mapped["fiber_g"] is None


def test_a_product_is_mapped() -> None:
    food = map_product(PRODUCT)
    assert food is not None
    assert (food.source, food.source_id, food.barcode) == ("off", "722252100108", "722252100108")
    assert food.name == "Peanut Butter Energy Bar"
    assert food.brand == "Clif Bar"  # the first of several
    assert [(s.label, s.grams) for s in food.servings] == [("68 g", 68.0)]


def test_a_serving_is_read_from_the_text_when_there_is_no_number() -> None:
    raw = {**PRODUCT, "serving_quantity": None, "serving_size": "1 bar (68 g)"}
    food = map_product(raw)
    assert food is not None and food.servings[0].grams == 68.0


def test_a_serving_in_millilitres_or_missing_is_left_out() -> None:
    for changes in (
        {"serving_size": "250 ml", "serving_quantity": 250},
        {"serving_size": None, "serving_quantity": None},
    ):
        food = map_product({**PRODUCT, **changes})
        assert food is not None
        if changes["serving_size"] == "250 ml":
            assert food.servings == []
        else:
            assert food.servings == []


def test_unusable_products_are_dropped() -> None:
    assert map_product({**PRODUCT, "product_name": " "}) is None
    assert map_product({**PRODUCT, "code": ""}) is None
    assert map_product({**PRODUCT, "nutriments": {"proteins_100g": 5}}) is None
    assert map_product({**PRODUCT, "nutriments": None}) is None


def test_a_brand_that_repeats_the_name_is_hidden() -> None:
    food = map_product({**PRODUCT, "product_name": "Clif Bar", "brands": "clif bar"})
    assert food is not None and food.brand is None


def client_replying(handler: Any) -> OpenFoodFactsClient:
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return OpenFoodFactsClient(base_url="https://example.test", client=http, retry_waits=())


def test_search_says_who_it_is_and_asks_for_the_right_page() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"products": [PRODUCT, {"code": "1"}], "count": 120})

    page = client_replying(handler).search("clif bar", 50, page=2)
    assert [food.source_id for food in page.foods] == ["722252100108"]
    assert page.has_more is True  # 2 pages of 50 do not cover 120
    assert seen[0].headers["User-Agent"] == USER_AGENT
    assert seen[0].url.params["search_terms"] == "clif bar"
    assert seen[0].url.params["page"] == "2"
    assert seen[0].url.params["page_size"] == "50"
    last = client_replying(lambda r: httpx.Response(200, json={"products": [], "count": 90}))
    assert last.search("x", 50, page=2).has_more is False


@pytest.mark.parametrize(("status", "words"), [(429, "busy"), (503, "problem")])
def test_failures_become_plain_messages(status: int, words: str) -> None:
    with pytest.raises(FoodSourceError, match=words):
        client_replying(lambda request: httpx.Response(status)).search("x", 5)


@pytest.mark.parametrize("body", [{"nope": 1}, {"products": "x"}, [1]])
def test_an_unexpected_reply_is_reported(body: Any) -> None:
    client = client_replying(lambda request: httpx.Response(200, json=body))
    with pytest.raises(FoodSourceError, match="unexpected"):
        client.search("x", 5)


def test_timeouts_and_network_errors_are_reported() -> None:
    def slow(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    with pytest.raises(FoodSourceError, match="too long"):
        client_replying(slow).search("x", 5)
    with pytest.raises(FoodSourceError, match="Could not reach"):
        client_replying(down).search("x", 5)


def test_it_is_a_fallback_source() -> None:
    assert OpenFoodFactsClient.fallback is True


def test_the_serving_text_beats_a_disagreeing_number() -> None:
    raw = {**PRODUCT, "serving_size": "30 grams (0.25 cup)", "serving_quantity": 60}
    food = map_product(raw)
    assert food is not None and food.servings[0].grams == 30.0
    assert food.servings[0].label == "30 grams (0.25 cup)"


def test_a_country_limits_the_search_to_products_sold_there() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"products": [], "count": 0})

    http = httpx.Client(transport=httpx.MockTransport(handler))
    OpenFoodFactsClient("https://example.test", client=http, country="united-states").search(
        "egg", 5
    )
    OpenFoodFactsClient("https://example.test", client=http).search("egg", 5)
    assert seen[0].url.params["tag_0"] == "united-states"
    assert seen[0].url.params["tagtype_0"] == "countries"
    assert "tag_0" not in seen[1].url.params


def test_a_brief_overload_is_retried_once() -> None:
    codes = iter([503, 200])

    def handler(request: httpx.Request) -> httpx.Response:
        code = next(codes)
        return httpx.Response(code, json={"products": [PRODUCT], "count": 1})

    http = httpx.Client(transport=httpx.MockTransport(handler))
    client = OpenFoodFactsClient("https://example.test", client=http, retry_waits=(0.0,))
    assert len(client.search("clif", 5).foods) == 1


def test_a_second_failure_is_reported_with_its_status_for_the_developer() -> None:
    http = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(503)))
    client = OpenFoodFactsClient("https://example.test", client=http, retry_waits=(0.0,))
    with pytest.raises(FoodSourceError) as caught:
        client.search("x", 5)
    assert caught.value.detail == "HTTP 503"
    assert "problem" in str(caught.value)


def test_a_timeout_is_retried_once_then_reported() -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        raise httpx.ReadTimeout("slow", request=request)

    http = httpx.Client(transport=httpx.MockTransport(handler))
    client = OpenFoodFactsClient("https://example.test", client=http, retry_waits=(0.0,))
    with pytest.raises(FoodSourceError, match="too long"):
        client.search("x", 5)
    assert len(calls) == 2


def test_a_longer_overload_is_retried_up_to_three_times() -> None:
    codes = iter([503, 503, 200])

    def handler(request: httpx.Request) -> httpx.Response:
        code = next(codes)
        return httpx.Response(code, json={"products": [PRODUCT], "count": 1})

    http = httpx.Client(transport=httpx.MockTransport(handler))
    client = OpenFoodFactsClient("https://example.test", client=http, retry_waits=(0.0, 0.0))
    assert len(client.search("clif", 5).foods) == 1


def test_the_error_reply_is_kept_for_the_developer() -> None:
    reply = httpx.Response(500, text=" server \n broke ")
    http = httpx.Client(transport=httpx.MockTransport(lambda request: reply))
    client = OpenFoodFactsClient("https://example.test", client=http, retry_waits=())
    with pytest.raises(FoodSourceError) as caught:
        client.search("x", 5)
    assert caught.value.detail == "HTTP 500: server broke"


def test_after_failing_it_is_not_asked_again_until_the_cool_down_is_over() -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(503, text="<html><title>Page temporarily unavailable</title></html>")

    http = httpx.Client(transport=httpx.MockTransport(handler))
    client = OpenFoodFactsClient(
        "https://example.test", client=http, retry_waits=(), cooldown_seconds=60
    )
    with pytest.raises(FoodSourceError) as first:
        client.search("x", 5)
    assert first.value.detail == "HTTP 503: Page temporarily unavailable"
    with pytest.raises(FoodSourceError, match="problem") as second:
        client.search("x", 5)
    assert len(calls) == 1  # the second search did not even reach the service
    assert "skipped" in second.value.detail


def test_with_no_cool_down_every_search_asks_the_service() -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(503)

    http = httpx.Client(transport=httpx.MockTransport(handler))
    client = OpenFoodFactsClient(
        "https://example.test", client=http, retry_waits=(), cooldown_seconds=0
    )
    for _ in range(2):
        with pytest.raises(FoodSourceError):
            client.search("x", 5)
    assert len(calls) == 2
