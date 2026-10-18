import json
from typing import Any

import httpx
import pytest

from app.calc.nutrients import KEYS
from app.sources import FoodSourceError
from app.sources.usda import UsdaClient, map_food, map_nutrients, map_portions


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


def client_replying(handler: Any, retry_waits: tuple[float, ...] = ()) -> UsdaClient:
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return UsdaClient(
        "secret-key", base_url="https://example.test/fdc/v1", client=http, retry_waits=retry_waits
    )


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


def sent(request: httpx.Request) -> dict[str, Any]:
    """What was asked: the search is a JSON body, not part of the address."""
    body: dict[str, Any] = json.loads(request.content)
    return body


def types_of(request: httpx.Request) -> str:
    return "generic" if "Foundation" in sent(request)["dataType"] else "branded"


def test_search_sends_the_key_as_a_header_not_in_the_address() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"foods": [BRANDED, FOUNDATION, {"fdcId": 1}]})

    found = client_replying(handler).search("clif bar", 10).foods
    assert {food.source_id for food in found} == {"2345678", "1105073"}
    assert seen[0].headers["X-Api-Key"] == "secret-key"
    assert all("secret-key" not in str(request.url) for request in seen)
    assert sent(seen[0])["query"] == "clif bar"


def test_plain_foods_and_products_are_searched_separately_and_interleaved() -> None:
    seen: list[httpx.Request] = []
    generic = [{**FOUNDATION, "fdcId": n, "dataType": "SR Legacy"} for n in (1, 2, 3)]
    branded = [{**BRANDED, "fdcId": n, "dataType": "Branded"} for n in (11, 12)]

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        foods = generic if types_of(request) == "generic" else branded
        return httpx.Response(200, json={"foods": foods, "totalPages": 1})

    page = client_replying(handler).search("egg", 50)
    assert {types_of(request) for request in seen} == {"branded", "generic"}
    # Taking turns, so a plain food is always near the top: g1, b11, g2, b12, g3
    assert [food.source_id for food in page.foods] == ["1", "11", "2", "12", "3"]
    assert [food.is_generic for food in page.foods] == [True, False, True, False, True]


def test_only_curated_foods_count_as_plain_foods() -> None:
    for kind, expected in (
        ("Foundation", True),
        ("SR Legacy", True),
        ("Survey (FNDDS)", True),
        ("Branded", False),
    ):
        food = map_food({**FOUNDATION, "dataType": kind})
        assert food is not None and food.is_generic is expected
    unlabelled = map_food(FOUNDATION)
    assert unlabelled is not None and unlabelled.is_generic is False


def test_search_asks_for_the_requested_page_and_size() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"foods": [], "totalPages": 3})

    client = client_replying(handler)
    assert client.search("x", 50, page=2).has_more is True
    assert client.search("x", 50, page=3).has_more is False
    branded = [r for r in seen if types_of(r) == "branded"]
    assert sent(branded[0])["pageSize"] == 50
    assert sent(branded[0])["pageNumber"] == 2
    seen.clear()
    client.search("x", 5000)
    assert {sent(r)["pageSize"] for r in seen if types_of(r) == "branded"} == {200}
    assert {sent(r)["pageSize"] for r in seen if types_of(r) == "generic"} == {60}


def test_a_thin_strict_search_is_topped_up_with_partial_matches() -> None:
    modes: list[tuple[str, bool]] = []
    strict_food = {**BRANDED, "fdcId": 1, "description": "PEANUT BUTTER CLIF BAR"}
    loose_only = {**BRANDED, "fdcId": 2, "description": "CLIF BAR, CHOCOLATE"}

    def handler(request: httpx.Request) -> httpx.Response:
        mode = sent(request)["requireAllWords"]
        modes.append((types_of(request), mode))
        if types_of(request) == "generic":
            return httpx.Response(200, json={"foods": [], "totalPages": 1})
        foods = [strict_food] if mode else [loose_only, strict_food]
        return httpx.Response(200, json={"foods": foods, "totalPages": 1})

    page = client_replying(handler).search("peanut butter clif bar", 50)
    assert ("branded", True) in modes and ("branded", False) in modes
    assert [food.source_id for food in page.foods] == ["1", "2"]  # strict first, no duplicates
    assert page.has_more is False


def test_a_full_strict_search_does_not_need_the_looser_one() -> None:
    modes: list[tuple[str, bool]] = []
    foods = [{**BRANDED, "fdcId": number} for number in range(12)]

    def handler(request: httpx.Request) -> httpx.Response:
        modes.append((types_of(request), sent(request)["requireAllWords"]))
        return httpx.Response(200, json={"foods": foods, "totalPages": 4})

    page = client_replying(handler).search("bar", 50)
    assert ("branded", False) not in modes and page.has_more is True
    modes.clear()
    client_replying(handler).search("bar", 50, page=2)
    assert all(mode is True for _, mode in modes)


def test_one_group_failing_does_not_hide_what_the_other_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if types_of(request) == "generic":
            return httpx.Response(503)
        return httpx.Response(200, json={"foods": [BRANDED]})

    found = client_replying(handler).search("x", 5).foods
    assert [food.source_id for food in found] == ["2345678"]


def test_both_groups_failing_is_reported_with_the_reply_for_the_developer() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, text="  Bad  request:\n dataType 'x' is not valid  ")

    with pytest.raises(FoodSourceError) as caught:
        client_replying(handler).search("x", 5)
    assert caught.value.detail == "HTTP 400: Bad request: dataType 'x' is not valid"
    assert "secret-key" not in caught.value.detail
    assert "problem" in str(caught.value)


def test_a_long_error_reply_is_cut_short() -> None:
    client = client_replying(lambda request: httpx.Response(500, text="x" * 5000))
    with pytest.raises(FoodSourceError) as caught:
        client.search("x", 5)
    assert len(caught.value.detail) < 230


def test_the_search_is_sent_as_a_json_body_with_the_data_types_as_a_list() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"foods": []})

    client_replying(handler).search("whole milk", 10)
    generic = next(r for r in seen if types_of(r) == "generic")
    assert generic.method == "POST" and not generic.url.params
    assert sent(generic)["dataType"] == ["Foundation", "SR Legacy", "Survey (FNDDS)"]
    assert sent(generic)["query"] == "whole milk"


def test_a_passing_error_is_asked_again_with_the_same_data_types() -> None:
    seen: list[list[str]] = []
    codes = iter([503, 200])

    def handler(request: httpx.Request) -> httpx.Response:
        if types_of(request) == "branded":
            return httpx.Response(200, json={"foods": []})
        seen.append(sent(request)["dataType"])
        code = next(codes)
        return httpx.Response(code, json={"foods": [FOUNDATION]} if code == 200 else {})

    found = client_replying(handler, retry_waits=(0.0,)).search("x", 1).foods
    assert [food.source_id for food in found] == ["1105073"]
    assert len(seen) == 2 and seen[0] == seen[1] and "Survey (FNDDS)" in seen[0]


def test_it_gives_up_after_the_last_retry() -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(503)

    with pytest.raises(FoodSourceError):
        client_replying(handler, retry_waits=(0.0, 0.0)).search("x", 5)
    assert len(calls) == 6  # two groups, each asked three times


def test_a_refused_key_is_not_retried() -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(403)

    with pytest.raises(FoodSourceError, match="refused"):
        client_replying(handler, retry_waits=(0.0, 0.0)).search("x", 5)
    assert len(calls) == 2


ONCE = "CLIF BAR, CLIF KIT'S ORGANIC, FRUIT + NUT BAR, PEANUT BUTTER"


def test_a_name_repeated_by_usda_is_shown_once() -> None:
    raw = {
        **BRANDED,
        "description": f"{ONCE}, {ONCE}",
    }
    food = map_food(raw)
    assert food is not None
    assert food.name == "Clif Bar, Clif Kit's Organic, Fruit + Nut Bar, Peanut Butter"
    legitimate = map_food({**BRANDED, "description": "Rice, white, long-grain, cooked"})
    assert legitimate is not None and legitimate.name == "Rice, white, long-grain, cooked"


@pytest.mark.parametrize(
    ("household", "grams", "label"),
    [
        ("1 ONZ", 28.0, "1 oz (28 g)"),
        ("3/4 cup (20g) (age 1-3 years)", 20.0, "3/4 cup (20 g)"),
        ("1 bar (40g)", 40.0, "1 bar (40 g)"),
        ("0.667 CUP | ABOUT", 30.0, "0.667 cup (30 g)"),
        ("1 BAR", 68.0, "1 bar (68 g)"),
        ("15 GRM", 15.0, "15 g (15 g)"),
        ("", 30.0, "1 serving (30 g)"),
    ],
)
def test_serving_labels_are_tidied(household: str, grams: float, label: str) -> None:
    food = map_food(
        {
            **BRANDED,
            "servingSize": grams,
            "servingSizeUnit": "g",
            "householdServingFullText": household,
        }
    )
    assert food is not None and food.servings[0].label == label


def test_an_error_web_page_is_reduced_to_its_title() -> None:
    page = "<!DOCTYPE html><html><head><title> Page  unavailable </title></head><body>x</body>"
    client = client_replying(lambda request: httpx.Response(503, text=page))
    with pytest.raises(FoodSourceError) as caught:
        client.search("x", 5)
    assert caught.value.detail == "HTTP 503: Page unavailable"


def test_a_failed_group_and_a_retry_are_written_down_for_the_developer_report() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if types_of(request) == "generic":
            return httpx.Response(503, text="Service down")
        return httpx.Response(200, json={"foods": [BRANDED]})

    client = client_replying(handler, retry_waits=(0.0,))
    assert [food.source_id for food in client.search("x", 5).foods] == ["2345678"]
    assert any("HTTP 503: Service down, asked again" in note for note in client.notes)
    assert any("search failed: HTTP 503: Service down" in note for note in client.notes)
    # A clean search starts with no notes.
    client.search("y", 5)
    assert client.notes != []  # the generic group fails again, and says so


# --- household measures ---


def _portion(**fields: Any) -> dict[str, Any]:
    return {"gramWeight": 100.0, **fields}


def test_portions_written_as_a_sentence_amount_and_unit_or_size_word() -> None:
    found = map_portions(
        {
            "foodPortions": [
                _portion(portionDescription="1 cup", gramWeight=244.0, modifier="10205"),
                _portion(
                    amount=1.0, measureUnit={"name": "cup"}, modifier="chopped", gramWeight=125
                ),
                _portion(
                    amount=1.0,
                    measureUnit={"name": "undetermined"},
                    modifier='medium (7" long)',
                    gramWeight=118,
                ),
                _portion(amount=2.0, measureUnit={"name": "tbsp"}, modifier="10205", gramWeight=32),
            ]
        }
    )
    assert [(s.label, s.grams) for s in found] == [
        ("1 cup (244 g)", 244.0),
        ("1 cup chopped (125 g)", 125.0),
        ("1 medium (118 g)", 118.0),
        ("2 tbsp (32 g)", 32.0),
    ]


def test_unusable_portions_are_skipped_not_guessed() -> None:
    found = map_portions(
        {
            "foodPortions": [
                _portion(portionDescription="Quantity not specified"),
                _portion(portionDescription="1 cup", gramWeight=0),
                _portion(portionDescription="1 cup", gramWeight=None),
                _portion(portionDescription="1 cup", gramWeight=99999),
                _portion(amount=1, measureUnit={"name": "undetermined"}, modifier="10205"),
                _portion(
                    portionDescription="Guideline amount per cup of hot cereal", gramWeight=61
                ),
                _portion(amount=1, measureUnit={"name": "RACC"}, gramWeight=30),
                _portion(portionDescription="1 RACC", gramWeight=30),
                _portion(portionDescription="1 slice", gramWeight=28),
                _portion(portionDescription="1 slice", gramWeight=28),  # same again
                "not a portion",
            ]
        }
    )
    assert [s.label for s in found] == ["1 slice (28 g)"]


def test_no_portions_at_all() -> None:
    assert map_portions({}) == []
    assert map_portions({"foodPortions": "x"}) == []


def test_a_long_description_is_cut_so_the_weight_stays_on_the_label() -> None:
    (found,) = map_portions(
        {"foodPortions": [_portion(portionDescription="x" * 200, gramWeight=12.5)]}
    )
    assert len(found.label) <= 60 and found.label.endswith("(12.5 g)")


def test_measures_are_fetched_from_the_food_detail_with_the_key_in_a_header() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"foodPortions": [_portion(portionDescription="1 cup")]})

    found = client_replying(handler).measures("1105073")
    assert [s.label for s in found] == ["1 cup (100 g)"]
    assert seen[0].method == "GET" and seen[0].url.path.endswith("/food/1105073")
    assert "secret-key" not in str(seen[0].url) and seen[0].headers["x-api-key"] == "secret-key"


def test_measures_for_an_unknown_food_are_empty_and_a_bad_id_is_refused() -> None:
    assert client_replying(lambda r: httpx.Response(404, json={})).measures("1") == []
    with pytest.raises(FoodSourceError):
        client_replying(lambda r: httpx.Response(200, json={})).measures("../x")


@pytest.mark.parametrize("status", [401, 500])
def test_measures_report_a_database_problem(status: int) -> None:
    with pytest.raises(FoodSourceError) as caught:
        client_replying(lambda r: httpx.Response(status, text="no")).measures("1")
    assert caught.value.detail and f"HTTP {status}" in caught.value.detail
