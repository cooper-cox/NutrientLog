"""USDA FoodData Central (https://fdc.nal.usda.gov): search, and mapping to our own food shape.

Mapping is separate from the web request so it can be tested without the internet. It is
defensive on purpose: USDA data is uneven (all-caps names, missing nutrients, odd units), so
anything unclear becomes "unknown" (None), never a guess and never zero.
"""

import re
from typing import Any

import httpx

from app.calc.nutrient_catalog import CATALOG, MAX_PER_100G, convert_amount
from app.integrations.base import FoodCandidate, FoodPage, FoodSourceError, ServingCandidate

SOURCE = "usda"
BASE_URL = "https://api.nal.usda.gov/fdc/v1"
# Generic foods first (Foundation, SR Legacy), then branded products.
DATA_TYPES = "Foundation,SR Legacy,Branded"
MAX_SERVING_GRAMS = 5000.0
MAX_PAGE_SIZE = 200  # the most USDA allows
LOOSE_BELOW = 10  # fewer strict matches than this: also look for partial matches
KJ_PER_KCAL = 4.184


def _nutrient_entry(entry: dict[str, Any]) -> tuple[str | None, str | None, float | None]:
    """(nutrient number, unit, amount) from either shape USDA uses (search or full detail)."""
    nested = entry.get("nutrient")
    if isinstance(nested, dict):
        number, unit, amount = nested.get("number"), nested.get("unitName"), entry.get("amount")
    else:
        number, unit, amount = (
            entry.get("nutrientNumber"),
            entry.get("unitName"),
            entry.get("value"),
        )
    if number is None or not isinstance(amount, int | float) or isinstance(amount, bool):
        return None, None, None
    return str(number), None if unit is None else str(unit), float(amount)


def map_nutrients(raw_nutrients: list[dict[str, Any]]) -> dict[str, float | None]:
    """Every catalog nutrient per 100 g; one USDA does not report (or reports oddly) is None."""
    reported: dict[str, tuple[str | None, float]] = {}
    for entry in raw_nutrients:
        number, unit, amount = _nutrient_entry(entry)
        if number is not None and amount is not None and number not in reported:
            reported[number] = (unit, amount)

    mapped: dict[str, float | None] = {}
    for nutrient in CATALOG:
        mapped[nutrient.key] = None
        for number in nutrient.usda_numbers:
            if number not in reported:
                continue
            unit, amount = reported[number]
            if unit is None:
                continue
            if nutrient.unit == "kcal":
                value = amount if unit.lower() == "kcal" else None
            else:
                value = convert_amount(amount, unit, nutrient.unit)
            if value is None or value < 0 or value > MAX_PER_100G[nutrient.unit]:
                continue  # unreadable or absurd: try the next USDA number, else unknown
            mapped[nutrient.key] = round(value, 3)
            break

    # Some foods give energy only in kilojoules (number 268).
    if mapped["calories"] is None and "268" in reported:
        unit, amount = reported["268"]
        if unit is not None and unit.lower() == "kj":
            kcal = amount / KJ_PER_KCAL
            if 0 <= kcal <= MAX_PER_100G["kcal"]:
                mapped["calories"] = round(kcal, 1)
    return mapped


def _tidy_name(text: str) -> str:
    """USDA writes many names in capitals ("CLIF BAR"); make those readable.

    Only the first letter of each word is capitalised, so "KIT'S" becomes "Kit's", not "Kit'S".
    """
    text = " ".join(text.split())
    if not text.isupper():
        return text
    return re.sub(r"(^|[\s(/\-,])([a-z])", lambda m: m[1] + m[2].upper(), text.lower())


def _serving(raw: dict[str, Any]) -> list[ServingCandidate]:
    size = raw.get("servingSize")
    unit = str(raw.get("servingSizeUnit") or "").lower()
    if not isinstance(size, int | float) or isinstance(size, bool):
        return []
    if unit not in ("g", "grm") or not 0 < size <= MAX_SERVING_GRAMS:
        return []  # millilitres and the like can't be turned into grams without guessing
    household = " ".join(str(raw.get("householdServingFullText") or "").split())
    grams = f"{size:g} g"
    label = f"{household} ({grams})" if household else f"1 serving ({grams})"
    return [ServingCandidate(label=label[:60], grams=float(size))]


def map_food(raw: dict[str, Any]) -> FoodCandidate | None:
    """One USDA search result as a FoodCandidate, or None if it can't be used.

    A food without calories is dropped: this is a calorie tracker, and "unknown calories" can't
    be logged in any useful way.
    """
    fdc_id = raw.get("fdcId")
    description = raw.get("description")
    if fdc_id is None or not isinstance(description, str) or not description.strip():
        return None
    nutrients = map_nutrients(raw.get("foodNutrients") or [])
    if nutrients["calories"] is None:
        return None
    brand = raw.get("brandName") or raw.get("brandOwner")
    if brand and _tidy_name(str(brand)).lower() == _tidy_name(description).lower():
        brand = None  # the name already says it; don't show it twice
    barcode = raw.get("gtinUpc")
    return FoodCandidate(
        source=SOURCE,
        source_id=str(fdc_id),
        name=_tidy_name(description)[:200],
        brand=_tidy_name(str(brand))[:100] if brand else None,
        barcode=str(barcode).strip() or None if barcode else None,
        nutrients=nutrients,
        servings=_serving(raw),
    )


class UsdaClient:
    """Searches FoodData Central. The API key is sent as a header, so it never appears in a URL."""

    name = SOURCE

    def __init__(
        self,
        api_key: str,
        base_url: str = BASE_URL,
        timeout_seconds: float = 8.0,
        client: httpx.Client | None = None,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = client or httpx.Client(timeout=timeout_seconds)

    def search(self, query: str, limit: int, page: int = 1) -> FoodPage:
        """Foods with every word first; if that finds few, foods with some of the words follow.

        USDA's "every word" mode can be too strict (one odd word in a long name hides a good
        match), so a thin first page is topped up from the looser search, best matches first.
        """
        strict = self._ask(query, limit, page, require_all=True)
        if page > 1 or len(strict.foods) >= min(limit, LOOSE_BELOW):
            return strict
        loose = self._ask(query, limit, page, require_all=False)
        seen = {food.source_id for food in strict.foods}
        extra = [food for food in loose.foods if food.source_id not in seen]
        # The merged list is already one big page, so there is no "next page" to offer.
        return FoodPage((strict.foods + extra)[:limit], False)

    def _ask(self, query: str, limit: int, page: int, require_all: bool) -> FoodPage:
        try:
            response = self._client.get(
                f"{self._base_url}/foods/search",
                params={
                    "query": query,
                    "pageSize": min(max(limit, 1), MAX_PAGE_SIZE),
                    "pageNumber": max(page, 1),
                    "dataType": DATA_TYPES,
                    "requireAllWords": "true" if require_all else "false",
                },
                headers={"X-Api-Key": self._api_key},
            )
        except httpx.TimeoutException as error:
            raise FoodSourceError("The USDA food database took too long to answer.") from error
        except httpx.HTTPError as error:
            raise FoodSourceError("Could not reach the USDA food database.") from error

        if response.status_code in (401, 403):
            raise FoodSourceError("The USDA food database refused our key.")
        if response.status_code == 429:
            raise FoodSourceError("The USDA food database is busy (too many searches). Try later.")
        if response.status_code != 200:
            raise FoodSourceError("The USDA food database had a problem. Try again later.")
        try:
            body = response.json()
            foods = body["foods"]
        except (ValueError, KeyError, TypeError) as error:
            raise FoodSourceError("The USDA food database sent something unexpected.") from error
        if not isinstance(foods, list):
            raise FoodSourceError("The USDA food database sent something unexpected.")

        found = [map_food(item) for item in foods if isinstance(item, dict)]
        total_pages = body.get("totalPages")
        if isinstance(total_pages, int) and not isinstance(total_pages, bool):
            has_more = page < total_pages
        else:
            has_more = len(foods) >= limit  # USDA didn't say, so a full page suggests more
        return FoodPage([food for food in found if food is not None], has_more)
