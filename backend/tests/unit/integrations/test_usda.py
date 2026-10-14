from typing import Any

import httpx
import pytest

from app.calc.nutrient_catalog import KEYS
from app.integrations.base import FoodSourceError
from app.integrations.usda import UsdaClient, map_food, map_nutrients


def row(number: str, unit: str, value: float) -> dict[str, Any]:
    """A nutrient entry the way USDA's search results write it."""
    return {"nutrientNumber": number, "unitName": unit, "value": value}


BRANDED: dict[str, Any] = {
    "fdcId": 2345678,
    "description": "CHOCOLATE CHIP ENERGY BAR",
    "brandOwner": "CLIF BAR & COMPANY",
    "brandName": "CLIF BAR",
    "gtinUpc": "722252100108",
    "servingSize": 68.0,
    "servingSizeUnit": "g",
    "householdServingFullText": "1 bar",
    "foodNutrients": [
        row("208", "KCAL", 382.0),
        row("203", "G", 11.8),
        row("204", "G", 8.8),
        row("205", "G", 66.2),
        row("307", "MG", 250.0),
        row("320", "UG", 0.0),
    ],
}

FOUNDATION: dict[str, Any] = {
    "fdcId": 1105073,
    "description": "Bananas, ripe, raw",
    "foodNutrients": [
        row("957", "KCAL", 92.0),
        row("958", "KCAL", 97.0),
        row("203", "G", 0.74),
        row("306", "MG", 358.0),
        row("301", "MG", 5.0),
        row("401", "MG", 8.7),
    ],
}


def test_every_catalog_nutrient_is_present_and_unreported_ones_are_unknown() -> None:
    mapped = map_nutrients(BRANDED["foodNutrients"])
    assert list(mapped) == list(KEYS)
    assert mapped["calories"] == 382.0
    assert mapped["sodium_mg"] == 250.0
    assert mapped["zinc_mg"] is None


def test_a_reported_zero_is_zero_not_unknown() -> None:
    assert map_nutrients(BRANDED["foodNutrients"])["vitamin_a_ug"] == 0.0


def test_energy_falls_back_through_the_calculated_numbers() -> None:
    assert map_nutrients([row("958", "KCAL", 97.0), row("957", "KCAL", 92.0)])["calories"] == 97.0
    assert map_nutrients([row("957", "KCAL", 92.0)])["calories"] == 92.0


def test_energy_in_kilojoules_is_converted_when_nothing_else_is_given() -> None:
    assert map_nutrients([row("268", "kJ", 418.4)])["calories"] == 100.0
    assert map_nutrients([row("208", "KCAL", 50.0), row("268", "kJ", 999.0)])["calories"] == 50.0


def test_units_are_converted_into_ours() -> None:
    mapped = map_nutrients([row("301", "G", 0.5), row("401", "UG", 1000.0)])
    assert mapped["calcium_mg"] == 500.0
    assert mapped["vitamin_c_mg"] == 1.0


def test_odd_units_and_absurd_values_become_unknown() -> None:
    mapped = map_nutrients(
        [
            row("208", "kcal", 120.0),
            row("320", "IU", 500.0),
            row("203", "G", 250.0),
            row("204", "G", -1.0),
        ]
    )
    assert mapped["vitamin_a_ug"] is None
    assert mapped["protein_g"] is None
    assert mapped["fat_g"] is None


def test_both_shapes_of_nutrient_entry_are_understood() -> None:
    detailed = {"nutrient": {"number": "203", "unitName": "g"}, "amount": 7.5}
    assert map_nutrients([detailed])["protein_g"] == 7.5


def test_garbage_entries_are_ignored() -> None:
    mapped = map_nutrients([{}, {"nutrientNumber": "203"}, row("203", "G", True)])
    assert mapped["protein_g"] is None


def test_a_branded_food_is_mapped_and_tidied() -> None:
    food = map_food(BRANDED)
    assert food is not None
    assert (food.source, food.source_id) == ("usda", "2345678")
    assert food.name == "Chocolate Chip Energy Bar"
    assert food.brand == "Clif Bar"
    assert food.barcode == "722252100108"
    assert [(s.label, s.grams) for s in food.servings] == [("1 bar (68 g)", 68.0)]


def test_a_generic_food_has_no_brand_or_serving() -> None:
    food = map_food(FOUNDATION)
    assert food is not None
    assert food.name == "Bananas, ripe, raw"
    assert food.brand is None and food.barcode is None and food.servings == []
    assert food.nutrients["calories"] == 97.0


def test_a_serving_in_millilitres_is_left_out() -> None:
    raw = {**BRANDED, "servingSize": 240.0, "servingSizeUnit": "ml"}
    food = map_food(raw)
    assert food is not None and food.servings == []


def test_a_food_with_no_calories_or_no_name_is_dropped() -> None:
    assert map_food({**BRANDED, "foodNutrients": [row("203", "G", 5.0)]}) is None
    assert map_food({**BRANDED, "description": "  "}) is None
    assert map_food({**BRANDED, "fdcId": None}) is None


def client_replying(handler: Any) -> UsdaClient:
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return UsdaClient("secret-key", base_url="https://example.test/fdc/v1", client=http)


def test_search_sends_the_key_as_a_header_not_in_the_address() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"foods": [BRANDED, FOUNDATION, {"fdcId": 1}]})

    found = client_replying(handler).search("clif bar", 10).foods
    assert [food.source_id for food in found] == ["2345678", "1105073"]
    assert seen[0].headers["X-Api-Key"] == "secret-key"
    assert "secret-key" not in str(seen[0].url)
    assert seen[0].url.params["query"] == "clif bar"


def test_search_asks_for_the_requested_page_and_size() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"foods": [], "totalPages": 3})

    client = client_replying(handler)
    assert client.search("x", 50, page=2).has_more is True
    assert client.search("x", 50, page=3).has_more is False
    assert seen[0].url.params["pageSize"] == "50"
    assert seen[0].url.params["pageNumber"] == "2"
    client.search("x", 5000)
    assert seen[2].url.params["pageSize"] == "200"


def test_without_a_page_count_a_full_page_suggests_there_is_more() -> None:
    client = client_replying(
        lambda request: httpx.Response(200, json={"foods": [BRANDED, FOUNDATION]})
    )
    assert client.search("x", 2).has_more is True
    assert client.search("x", 3).has_more is False


@pytest.mark.parametrize(
    ("status", "words"),
    [(403, "refused"), (401, "refused"), (429, "busy"), (500, "problem")],
)
def test_search_failures_become_plain_messages(status: int, words: str) -> None:
    client = client_replying(lambda request: httpx.Response(status))
    with pytest.raises(FoodSourceError, match=words):
        client.search("x", 5)


@pytest.mark.parametrize("body", [{"nope": 1}, {"foods": "x"}, [1, 2]])
def test_an_unexpected_reply_is_reported(body: Any) -> None:
    client = client_replying(lambda request: httpx.Response(200, json=body))
    with pytest.raises(FoodSourceError, match="unexpected"):
        client.search("x", 5)


def test_unreadable_reply_is_reported() -> None:
    client = client_replying(lambda request: httpx.Response(200, content=b"<html>"))
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


def test_names_in_capitals_are_tidied_without_capitalising_after_apostrophes() -> None:
    raw = {**BRANDED, "description": "CLIF KIT'S ORGANIC, FRUIT + NUT BAR, PEANUT BUTTER"}
    food = map_food(raw)
    assert food is not None
    assert food.name == "Clif Kit's Organic, Fruit + Nut Bar, Peanut Butter"
    assert map_food({**BRANDED, "description": "Mixed-case Name"}).name == "Mixed-case Name"  # type: ignore[union-attr]


def test_a_brand_that_just_repeats_the_name_is_dropped() -> None:
    raw = {**BRANDED, "description": "CLIF BAR", "brandName": "Clif Bar"}
    food = map_food(raw)
    assert food is not None and food.brand is None


def test_a_thin_strict_search_is_topped_up_with_partial_matches() -> None:
    modes: list[str] = []
    strict_food = {**BRANDED, "fdcId": 1, "description": "PEANUT BUTTER CLIF BAR"}
    loose_only = {**BRANDED, "fdcId": 2, "description": "CLIF BAR, CHOCOLATE"}

    def handler(request: httpx.Request) -> httpx.Response:
        mode = request.url.params["requireAllWords"]
        modes.append(mode)
        foods = [strict_food] if mode == "true" else [loose_only, strict_food]
        return httpx.Response(200, json={"foods": foods, "totalPages": 1})

    page = client_replying(handler).search("peanut butter clif bar", 50)
    assert modes == ["true", "false"]
    assert [food.source_id for food in page.foods] == ["1", "2"]  # strict first, no duplicates
    assert page.has_more is False


def test_a_full_strict_search_does_not_need_the_looser_one() -> None:
    modes: list[str] = []
    foods = [{**BRANDED, "fdcId": number} for number in range(12)]

    def handler(request: httpx.Request) -> httpx.Response:
        modes.append(request.url.params["requireAllWords"])
        return httpx.Response(200, json={"foods": foods, "totalPages": 4})

    page = client_replying(handler).search("bar", 50)
    assert modes == ["true"] and len(page.foods) == 12 and page.has_more is True
    client_replying(handler).search("bar", 50, page=2)
    assert modes == ["true", "true"]
