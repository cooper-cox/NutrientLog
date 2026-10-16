"""USDA FoodData Central (https://fdc.nal.usda.gov): search, and mapping to our own food shape.

Mapping is separate from the web request so it can be tested without the internet. It is
defensive on purpose: USDA data is uneven (all-caps names, missing nutrients, odd units), so
anything unclear becomes "unknown" (None), never a guess and never zero.
"""

import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx

from app.calc.nutrient_catalog import CATALOG, MAX_PER_100G, convert_amount
from app.integrations.base import (
    FoodCandidate,
    FoodPage,
    FoodSourceError,
    ServingCandidate,
    reply_snippet,
)

SOURCE = "usda"
BASE_URL = "https://api.nal.usda.gov/fdc/v1"
# Plain foods ("Egg, whole, raw") and packaged products are searched separately. Mixed together,
# the thousands of branded products crowd the plain foods out of the first results.
GENERIC_TYPES = "Foundation,SR Legacy,Survey (FNDDS)"
_GENERIC_DATA_TYPES = frozenset(GENERIC_TYPES.split(","))
BRANDED_TYPES = "Branded"
GENERIC_LIMIT = 60
MAX_SERVING_GRAMS = 5000.0
MAX_PAGE_SIZE = 200  # the most USDA allows
LOOSE_BELOW = 10  # fewer strict matches than this: also look for partial matches
KJ_PER_KCAL = 4.184
# USDA sometimes answers a good request with "400" or an overload code for a moment (the live
# check showed about half of a burst of searches failing that way). Waiting a little and asking
# again fixes most of them. Seconds to wait before each retry.
RETRY_WAITS = (1.0, 3.0)
_RETRY_STATUSES = frozenset({400, 429, 500, 502, 503, 504})


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


def _collapse_repeats(text: str) -> str:
    """USDA sometimes writes a name twice ("A, B, A, B") or repeats its last part; keep one."""
    parts = [part.strip() for part in text.split(",") if part.strip()]
    for size in range(len(parts) // 2, 0, -1):
        tail = [part.lower() for part in parts[-size:]]
        before = [part.lower() for part in parts[-2 * size : -size]]
        if tail == before:
            parts = parts[:-size]
            break
    return ", ".join(parts)


def _tidy_name(text: str) -> str:
    """USDA writes many names in capitals ("CLIF BAR"); make those readable.

    Only the first letter of each word is capitalised, so "KIT'S" becomes "Kit's", not "Kit'S".
    """
    text = _collapse_repeats(" ".join(text.split()))
    if not text.isupper():
        return text
    return re.sub(r"(^|[\s(/\-,])([a-z])", lambda m: m[1] + m[2].upper(), text.lower())


_UNIT_WORDS = {"onz": "oz", "grm": "g", "gram": "g", "grams": "g", "ozs": "oz"}


def _household_text(text: str) -> str:
    """ "1 ONZ", "0.667 CUP | ABOUT", "1 bar (40g)" -> "1 oz", "0.667 cup", "1 bar"."""
    text = text.split("|")[0]
    text = re.sub(r"\(\s*age[^)]*\)", "", text, flags=re.I)  # "(age 1-3 years)"
    text = re.sub(r"\(\s*\d+(?:\.\d+)?\s*g\s*\)", "", text, flags=re.I)  # the weight, shown anyway
    words = [_UNIT_WORDS.get(word.lower(), word) for word in text.split()]
    text = " ".join(words)
    if text.isupper():
        text = text.lower()
    return text[:1].upper() + text[1:] if text and not text[0].isdigit() else text


def _serving(raw: dict[str, Any]) -> list[ServingCandidate]:
    size = raw.get("servingSize")
    unit = str(raw.get("servingSizeUnit") or "").lower()
    if not isinstance(size, int | float) or isinstance(size, bool):
        return []
    if unit not in ("g", "grm") or not 0 < size <= MAX_SERVING_GRAMS:
        return []  # millilitres and the like can't be turned into grams without guessing
    household = _household_text(str(raw.get("householdServingFullText") or ""))
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
        is_generic=raw.get("dataType") in _GENERIC_DATA_TYPES,
    )


class UsdaClient:
    """Searches FoodData Central. The API key is sent as a header, so it never appears in a URL."""

    name = SOURCE
    fallback = False

    def __init__(
        self,
        api_key: str,
        base_url: str = BASE_URL,
        timeout_seconds: float = 8.0,
        client: httpx.Client | None = None,
        retry_waits: tuple[float, ...] = RETRY_WAITS,
    ) -> None:
        self._retry_waits = retry_waits
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = client or httpx.Client(timeout=timeout_seconds)

    def search(self, query: str, limit: int, page: int = 1) -> FoodPage:
        """Plain foods and packaged products, searched separately and interleaved.

        Each group asks for foods with every word first; if that finds few, foods with some of
        the words follow (USDA's "every word" mode is strict: one odd word hides a good match).
        """
        groups = [(GENERIC_TYPES, min(limit, GENERIC_LIMIT)), (BRANDED_TYPES, limit)]
        with ThreadPoolExecutor(max_workers=len(groups)) as pool:
            futures = [pool.submit(self._group, query, types, size, page) for types, size in groups]
            outcomes: list[FoodPage | FoodSourceError] = []
            for future in futures:
                try:
                    outcomes.append(future.result())
                except FoodSourceError as error:
                    outcomes.append(error)
        pages = [outcome for outcome in outcomes if isinstance(outcome, FoodPage)]
        if not pages:  # nothing came back at all: report the first problem
            failures = [o for o in outcomes if isinstance(o, FoodSourceError)]
            raise failures[0]
        # One group failing must not hide what the other found.
        mixed: list[FoodCandidate] = []
        for index in range(max(len(group.foods) for group in pages)):
            mixed.extend(group.foods[index] for group in pages if index < len(group.foods))
        return FoodPage(mixed, any(group.has_more for group in pages))

    def _group(self, query: str, data_types: str, limit: int, page: int) -> FoodPage:
        strict = self._ask(query, data_types, limit, page, require_all=True)
        if page > 1 or len(strict.foods) >= min(limit, LOOSE_BELOW):
            return strict
        loose = self._ask(query, data_types, limit, page, require_all=False)
        seen = {food.source_id for food in strict.foods}
        extra = [food for food in loose.foods if food.source_id not in seen]
        # The merged list is already one big page, so there is no "next page" to offer.
        return FoodPage((strict.foods + extra)[:limit], False)

    def _ask(
        self, query: str, data_types: str, limit: int, page: int, require_all: bool
    ) -> FoodPage:
        response = self._get(query, data_types, limit, page, require_all)
        if response.status_code in (401, 403):
            raise FoodSourceError(
                "The USDA food database refused our key.", f"HTTP {response.status_code}"
            )
        if response.status_code == 429:
            raise FoodSourceError("The USDA food database is busy (too many searches). Try later.")
        if response.status_code != 200:
            raise FoodSourceError(
                "The USDA food database had a problem. Try again later.",
                f"HTTP {response.status_code}{reply_snippet(response.text)}",
            )
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

    def _get(
        self, query: str, data_types: str, limit: int, page: int, require_all: bool
    ) -> httpx.Response:
        """One request, asked again after a short wait while USDA answers with a passing error.

        After a "400" the retry leaves out the "Survey (FNDDS)" data type, in case that is what
        USDA objected to; the reply text is kept so the developer can see what it really said.
        """
        types = data_types
        response: httpx.Response | None = None
        for wait in (0.0, *self._retry_waits):
            if wait:
                time.sleep(wait)
            try:
                response = self._client.get(
                    f"{self._base_url}/foods/search",
                    params={
                        "query": query,
                        "pageSize": min(max(limit, 1), MAX_PAGE_SIZE),
                        "pageNumber": max(page, 1),
                        "dataType": types,
                        "requireAllWords": "true" if require_all else "false",
                    },
                    headers={"X-Api-Key": self._api_key},
                )
            except httpx.TimeoutException as error:
                raise FoodSourceError("The USDA food database took too long to answer.") from error
            except httpx.HTTPError as error:
                raise FoodSourceError("Could not reach the USDA food database.") from error
            if response.status_code not in _RETRY_STATUSES:
                break
            if response.status_code == 400:
                types = ",".join(t for t in types.split(",") if "Survey" not in t) or types
        assert response is not None
        return response
