"""Shows what USDA's own household measures look like for a few everyday foods, and what an
amount typed in cups or spoons turns into. Run it from `backend/` (or inside the container):

    docker compose run --rm -T api python scripts/measures_check.py > measures_report.md

About 20 requests; never prints your key. It checks the one thing the tests cannot: that USDA's
real answer is read correctly.
"""

import time

from app.calc.measures import AmountError, measures_from_servings, parse_amount, to_grams
from app.foods import gather_and_rank
from app.settings import settings
from app.sources import FoodSourceError
from app.sources.usda import UsdaClient

CASES = [
    ("banana", "1 medium banana"),
    ("milk, whole", "1 cup milk"),
    ("all purpose flour", "1/2 cup flour"),
    ("vanilla extract", "1 fl oz vanilla extract"),
    ("olive oil", "1 tbsp olive oil"),
    ("peanut butter", "2 tbsp peanut butter"),
    ("egg", "1 large egg"),
    ("white rice cooked", "1 cup rice"),
]
PAUSE = 1.2


def main() -> None:
    if not settings.usda_api_key:
        raise SystemExit("No USDA_API_KEY set.")
    client = UsdaClient(settings.usda_api_key)
    print("# USDA measures check\n")
    for query, typed in CASES:
        print(f"## {query}\n")
        try:
            ranked, _statuses, _more = gather_and_rank(query, [client])
            time.sleep(PAUSE)
            food = ranked[0] if ranked else None
            if food is None:
                print("- no food found\n")
                continue
            found = client.measures(food.source_id)
            time.sleep(PAUSE)
        except FoodSourceError as error:
            print(f"- USDA problem: {error.detail or error}\n")
            continue
        print(f"Food: {food.name} (id {food.source_id})\n")
        print("Measures USDA gave:" if found else "Measures USDA gave: none")
        for measure in found:
            print(f"- {measure.label}")
        measures = measures_from_servings([(m.label, m.grams) for m in found])
        try:
            grams = to_grams(parse_amount(typed), measures, food_name=food.name)
            print(f"\nTyped '{typed}' -> {grams:.1f} g\n")
        except AmountError as error:
            print(f"\nTyped '{typed}' -> not converted: {error}\n")


if __name__ == "__main__":
    main()
