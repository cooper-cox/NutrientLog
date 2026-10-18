"""Open Food Facts (https://world.openfoodfacts.org): a free, community-built product database.

It adds many packaged and branded foods (and barcodes) that USDA lacks. Quality varies from
product to product, so anything unclear becomes "unknown" (None), exactly as for USDA.
Values come "per 100 g" with mass nutrients in grams; they are converted into our units.
"""

import re
import time
from typing import Any

import httpx

from app.calc.food_names import drop_repeated_flavor, short_brand
from app.calc.nutrients import CATALOG, MAX_PER_100G, convert_amount
from app.settings import settings
from app.sources import (
    FoodCandidate,
    FoodPage,
    FoodSourceError,
    ServingCandidate,
    reply_snippet,
)

SOURCE = "off"
BASE_URL = "https://world.openfoodfacts.org"
# Open Food Facts asks every app to say who it is.
USER_AGENT = "NutrientLog/0.1 (learning project; https://github.com/cooper-cox/NutrientLog)"
MAX_SERVING_GRAMS = 5000.0
KJ_PER_KCAL = 4.184
# The service is often briefly overloaded ("503"). Seconds to wait before each retry.
RETRY_WAITS = settings.search.off_retry_waits
# After it fails every retry, it is not asked again for this long: asking a struggling service
# again and again only makes the person wait through the retries on every search.
COOLDOWN_SECONDS = settings.search.off_cooldown_seconds

# Catalog key -> the name Open Food Facts uses for it (values are per 100 g, in grams).
_OFF_NAMES: dict[str, str] = {
    "protein_g": "proteins",
    "fat_g": "fat",
    "saturated_fat_g": "saturated-fat",
    "carb_g": "carbohydrates",
    "fiber_g": "fiber",
    "sugar_g": "sugars",
    "cholesterol_mg": "cholesterol",
    "sodium_mg": "sodium",
    "potassium_mg": "potassium",
    "calcium_mg": "calcium",
    "iron_mg": "iron",
    "magnesium_mg": "magnesium",
    "zinc_mg": "zinc",
    "vitamin_c_mg": "vitamin-c",
    "vitamin_d_ug": "vitamin-d",
    "vitamin_k_ug": "vitamin-k",
    "vitamin_b12_ug": "vitamin-b12",
    "folate_ug": "vitamin-b9",
}
_FIELDS = "code,product_name,brands,nutriments,serving_size,serving_quantity"


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def map_nutrients(nutriments: dict[str, Any]) -> dict[str, float | None]:
    """Every catalog nutrient per 100 g; ones not reported (or absurd) are None."""
    mapped: dict[str, float | None] = {nutrient.key: None for nutrient in CATALOG}

    kcal = _number(nutriments.get("energy-kcal_100g"))
    if kcal is None:
        kilojoules = _number(nutriments.get("energy_100g"))
        kcal = None if kilojoules is None else kilojoules / KJ_PER_KCAL
    if kcal is not None and 0 <= kcal <= MAX_PER_100G["kcal"]:
        mapped["calories"] = round(kcal, 1)

    for nutrient in CATALOG:
        off_name = _OFF_NAMES.get(nutrient.key)
        if off_name is None:
            continue
        grams = _number(nutriments.get(f"{off_name}_100g"))
        if grams is None:
            continue
        value = convert_amount(grams, "g", nutrient.unit)
        if value is not None and 0 <= value <= MAX_PER_100G[nutrient.unit]:
            mapped[nutrient.key] = round(value, 3)
    return mapped


def _serving(raw: dict[str, Any]) -> list[ServingCandidate]:
    text = " ".join(str(raw.get("serving_size") or "").split())
    # What the label text says beats the separate number, which is often out of step with it.
    grams = _grams_in(text)
    if grams is None:
        grams = _number(raw.get("serving_quantity"))
    # A serving given in millilitres cannot be turned into grams without guessing.
    if (
        grams is None
        or not 0 < grams <= MAX_SERVING_GRAMS
        or re.search(r"\d\s*(ml|cl|l)\b", text, re.I)
    ):
        return []
    label = text if text else f"1 serving ({grams:g} g)"
    if not re.search(r"\d\s*(g|gr|gram|grams|gm)\b", label, re.I):
        label = f"{label} ({grams:g} g)"
    return [ServingCandidate(label=label[:60], grams=grams)]


def _grams_in(text: str) -> float | None:
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:g|gr|gm|gram|grams)\b", text, re.I)
    return float(match[1].replace(",", ".")) if match else None


def map_product(raw: dict[str, Any]) -> FoodCandidate | None:
    """One Open Food Facts product as a FoodCandidate, or None if it can't be used."""
    code = str(raw.get("code") or "").strip()
    name = " ".join(str(raw.get("product_name") or "").split())
    nutriments = raw.get("nutriments")
    if not code or not name or not isinstance(nutriments, dict):
        return None
    nutrients = map_nutrients(nutriments)
    if nutrients["calories"] is None:
        return None
    brand = short_brand(str(raw.get("brands") or "").split(",")[0]) or None
    if brand and brand.lower() == name.lower():
        brand = None
    name = drop_repeated_flavor(name)
    return FoodCandidate(
        source=SOURCE,
        source_id=code[:64],
        name=name[:200],
        brand=brand[:100] if brand else None,
        barcode=code[:32],
        nutrients=nutrients,
        servings=_serving(raw),
    )


class OpenFoodFactsClient:
    name = SOURCE
    # Asked only when USDA found few close matches: OFF is slower and allows about 10 searches
    # a minute, and its community data is messier.
    fallback = True

    def __init__(
        self,
        base_url: str = BASE_URL,
        timeout_seconds: float = settings.search.timeout_seconds,
        client: httpx.Client | None = None,
        country: str = "",
        retry_waits: tuple[float, ...] = RETRY_WAITS,
        cooldown_seconds: float = COOLDOWN_SECONDS,
    ) -> None:
        self._cooldown = cooldown_seconds
        self._down_until = 0.0
        # A country such as "united-states" keeps out foreign-language products.
        self._country = country
        self._retry_waits = retry_waits
        self._base_url = base_url.rstrip("/")
        self._client = client or httpx.Client(timeout=timeout_seconds)

    def measures(self, source_id: str) -> list[ServingCandidate]:
        """Open Food Facts products carry only their one package serving, already in the search."""
        return []

    def search(self, query: str, limit: int, page: int = 1) -> FoodPage:
        if time.monotonic() < self._down_until:
            raise FoodSourceError(
                "Open Food Facts had a problem. Try again later.", "skipped: failed a moment ago"
            )
        size = min(max(limit, 1), 100)
        params: dict[str, str | int] = {
            "search_terms": query,
            "search_simple": "1",
            "action": "process",
            "json": "1",
            "page_size": size,
            "page": max(page, 1),
            "sort_by": "unique_scans_n",  # most-scanned products first
            "fields": _FIELDS,
        }
        if self._country:
            params.update(tagtype_0="countries", tag_contains_0="contains", tag_0=self._country)
        response = self._get(params)

        if response.status_code == 429:
            raise FoodSourceError("Open Food Facts is busy (too many searches). Try later.")
        if response.status_code != 200:
            self._down_until = time.monotonic() + self._cooldown
            raise FoodSourceError(
                "Open Food Facts had a problem. Try again later.",
                f"HTTP {response.status_code}{reply_snippet(response.text)}",
            )
        try:
            body = response.json()
            products = body["products"]
        except (ValueError, KeyError, TypeError) as error:
            raise FoodSourceError("Open Food Facts sent something unexpected.") from error
        if not isinstance(products, list):
            raise FoodSourceError("Open Food Facts sent something unexpected.")

        found = [map_product(item) for item in products if isinstance(item, dict)]
        count = _number(body.get("count"))
        has_more = page * size < count if count is not None else len(products) >= size
        return FoodPage([food for food in found if food is not None], has_more)

    def _get(self, params: dict[str, str | int]) -> httpx.Response:
        """One request, retried after short waits while the service is briefly overloaded."""
        waits = (0.0, *self._retry_waits)
        for number, wait in enumerate(waits, start=1):
            if wait:
                time.sleep(wait)
            last = number == len(waits)
            try:
                response = self._client.get(
                    f"{self._base_url}/cgi/search.pl",
                    params=params,
                    headers={"User-Agent": USER_AGENT},
                )
            except httpx.TimeoutException as error:
                if last:
                    raise FoodSourceError("Open Food Facts took too long to answer.") from error
                continue
            except httpx.HTTPError as error:
                raise FoodSourceError("Could not reach Open Food Facts.") from error
            if response.status_code in (502, 503, 504) and not last:
                continue
            return response
        raise AssertionError("unreachable")  # pragma: no cover
