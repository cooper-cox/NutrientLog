"""Finds out why USDA sometimes answers "400 Bad Request" to a search.

Asks USDA the same search in several different ways and prints which ways work. Run it from
`backend/` (or inside the container) with your key set:

    docker compose run --rm -T api python scripts/usda_probe.py > usda_probe.md

It makes about 60 requests (a few minutes) and never prints your key.
"""

import time
from collections.abc import Callable
from typing import Any

import httpx

from app.settings import settings

BASE = "https://api.nal.usda.gov/fdc/v1/foods/search"
QUERIES = ["whole milk", "milk, whole", "cheerios", "snickers bar", "coca cola", "pizza", "banana"]
FULL = ["Foundation", "SR Legacy", "Survey (FNDDS)"]
PAUSE = 1.2  # seconds between requests, to stay well under USDA's rate limit


def get(client: httpx.Client, query: str, types: list[str], size: int, all_words: bool) -> str:
    params: dict[str, Any] = {
        "query": query,
        "pageSize": size,
        "dataType": ",".join(types),
        "requireAllWords": str(all_words).lower(),
    }
    return answer(client.get(BASE, params=params, headers={"X-Api-Key": settings.usda_api_key}))


def get_repeated(client: httpx.Client, query: str, size: int) -> str:
    params: list[tuple[str, str | int | float | bool | None]] = [
        ("query", query),
        ("pageSize", size),
        ("requireAllWords", "true"),
    ]
    params += [("dataType", kind) for kind in FULL]
    return answer(client.get(BASE, params=params, headers={"X-Api-Key": settings.usda_api_key}))


def post(client: httpx.Client, query: str, size: int) -> str:
    body = {"query": query, "pageSize": size, "dataType": FULL, "requireAllWords": True}
    return answer(client.post(BASE, json=body, headers={"X-Api-Key": settings.usda_api_key}))


def answer(response: httpx.Response) -> str:
    if response.status_code != 200:
        text = " ".join(response.text.split())[:80]
        return f"HTTP {response.status_code} ({text})"
    foods = response.json().get("foods", [])
    names = [str(food.get("description", "")) for food in foods]
    first = next((n for n in names if n.lower().startswith("milk, whole")), "")
    return f"ok, {len(foods)} foods" + (f"; has '{first}'" if first else "")


def main() -> None:
    if not settings.usda_api_key:
        raise SystemExit("No USDA_API_KEY set.")
    variants: dict[str, Callable[[httpx.Client, str], str]] = {
        "all three types, 60 results (what the app does)": lambda c, q: get(c, q, FULL, 60, True),
        "all three types, 25 results": lambda c, q: get(c, q, FULL, 25, True),
        "all three types, 60, any word": lambda c, q: get(c, q, FULL, 60, False),
        "Survey only, 60": lambda c, q: get(c, q, FULL[2:], 60, True),
        "Survey only, 25": lambda c, q: get(c, q, FULL[2:], 25, True),
        "Foundation + SR Legacy only, 60": lambda c, q: get(c, q, FULL[:2], 60, True),
        "all three types, repeated dataType=, 60": lambda c, q: get_repeated(c, q, 60),
        "all three types, POST with a JSON body, 60": lambda c, q: post(c, q, 60),
    }
    print("# USDA probe\n")
    with httpx.Client(timeout=15) as client:
        for query in QUERIES:
            print(f"## {query}\n")
            for label, run in variants.items():
                try:
                    result = run(client, query)
                except httpx.HTTPError as error:
                    result = f"network error: {type(error).__name__}"
                print(f"- {label}: {result}")
                time.sleep(PAUSE)
            print()


if __name__ == "__main__":
    main()
