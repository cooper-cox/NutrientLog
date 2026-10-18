"""Try a fixed list of real searches against the real food databases and print a report.

Run it from the main folder (needs your USDA_API_KEY in .env, and internet):

    docker compose run --rm -T api python scripts/search_check.py > search_report.md

Then send `search_report.md` back. For every search it shows the top results after our ranking,
whether the food you would expect is in the top five (PASS/FAIL), and what each database returned
first on its own, so a wrong answer can be traced to "never found" (a search problem) or "found
but ranked low" (a ranking problem). When a database fails, the report quotes what it actually
said, near the top. It takes a few minutes: Open Food Facts allows only about 10 searches a
minute, and USDA is also kinder when not rushed, so the script waits between its requests.
"""

import re
import sys
import time

from app.foods import gather_and_rank, serving_out
from app.settings import settings
from app.sources import FoodCandidate, FoodPage, FoodSource, FoodSourceError, ServingCandidate
from app.sources.openfoodfacts import OpenFoodFactsClient
from app.sources.usda import UsdaClient

# (what a person types, what they most likely mean, a pattern the right result's name+brand
# matches). A search PASSES when some result in the top five matches the pattern.
SEARCHES: list[tuple[str, str, str]] = [
    (
        "peanut butter clif bar",
        "Clif Bar, Crunchy Peanut Butter (68 g, about 260 kcal)",
        r"(?=.*clif)(?=.*crunchy peanut butter)",
    ),
    (
        "clif bar peanut butter",
        "same as above, other word order",
        r"(?=.*clif)(?=.*crunchy peanut butter)",
    ),
    ("clif bar", "any Clif Bar", r"clif"),
    (
        "kind bar dark chocolate nuts sea salt",
        "KIND bar of that flavour",
        r"kind.*dark chocolate.*sea salt|dark chocolate.*sea salt.*kind",
    ),
    (
        "quest protein bar cookie dough",
        "Quest bar, chocolate chip cookie dough",
        r"quest.*cookie dough|cookie dough.*quest",
    ),
    ("cheerios", "General Mills Cheerios cereal", r"cheerios"),
    ("oreo", "Oreo cookies", r"^oreos?\b|nabisco"),
    ("snickers", "Snickers bar", r"snickers"),
    ("coca cola", "Coca-Cola, regular", r"coca.?cola|cola"),
    ("gatorade", "Gatorade sports drink", r"gatorade"),
    ("banana", "a plain raw banana", r"^bananas?, (ripe, )?raw|^bananas?, raw|^banana$"),
    ("apple", "a plain raw apple", r"^apples?,.*raw|^apple$"),
    ("egg", "a whole egg", r"^eggs?, (whole|grade a.*whole)|^egg$"),
    ("whole milk", "milk, whole", r"milk, whole|^whole milk"),
    ("chicken breast", "chicken breast, plain", r"^chicken,? breast"),
    (
        "white rice cooked",
        "rice, white, cooked",
        r"rice.*white.*cooked|white rice.*cooked|cooked white rice",
    ),
    (
        "all purpose flour",
        "wheat flour, white, all-purpose",
        r"flour.*all.?purpose|all.?purpose flour",
    ),
    ("vanilla extract", "vanilla extract", r"vanilla extract"),
    ("olive oil", "olive oil", r"olive oil"),
    ("butter", "butter, plain", r"^butter,? (salted|unsalted|regular)|^butter$"),
    ("greek yogurt", "plain Greek yogurt", r"greek.*plain|plain.*greek|^greek yogurt"),
    ("oatmeal", "oats / oatmeal", r"^(oats|oatmeal|cereals.*oat)"),
    ("almond milk", "almond milk", r"almond milk"),
    ("avocado", "raw avocado", r"^avocados?,? raw|^avocado$"),
    ("broccoli", "raw or cooked broccoli", r"^broccoli,? (raw|cooked)"),
    ("salmon", "salmon, plain", r"salmon.*(raw|cooked|fillet)|^salmon$"),
    ("white bread", "bread, white", r"bread, white|white bread"),
    ("spaghetti", "pasta, cooked or dry", r"spaghetti|pasta"),
    ("cheddar cheese", "cheddar cheese", r"cheese, cheddar|cheddar cheese"),
    ("sugar", "white granulated sugar", r"sugars?, granulated|granulated sugar|^sugar"),
    ("honey", "honey", r"^honey"),
    ("peanut butter", "plain peanut butter", r"peanut butter"),
    ("jif peanut butter", "Jif peanut butter", r"jif"),
    ("whey protein", "whey protein powder", r"whey"),
    ("red bull", "Red Bull energy drink", r"red bull"),
    ("big mac", "McDonald's Big Mac", r"big mac"),
    ("pizza", "pizza, plain", r"pizza"),
    ("ramen noodles", "instant ramen", r"ramen"),
    ("banan", "half-typed banana", r"banana"),
    ("chiken breast", "misspelling of chicken breast", r"chicken.*breast"),
]
# Searches the app cannot answer yet, and why. They are shown in the report but not counted as
# failures, so a real regression stands out. Remove an entry when its limitation is fixed.
KNOWN_GAPS: dict[str, str] = {
    "chiken breast": "L46: USDA does not tolerate misspellings, so only misspelt community entries "
    "come back",
    "banan": "L46: USDA does not match half-typed words, so only misspelt entries come back",
}
SHOW = 5  # results shown per search
RAW_SHOW = 3  # what each database returns first, untouched
RAW_SHOW_FAILED = 15  # more of it when a search fails, to see what was available
# Seconds to wait before each request to a database (Open Food Facts allows about 10 searches a
# minute; USDA answered a quick burst of searches with errors).
PAUSE_SECONDS = {"off": 7.0, "usda": 2.0}


class Recorder:
    """Passes searches through to a real database, remembers the raw answer, paces the calls."""

    def __init__(self, source: FoodSource) -> None:
        self._source = source
        self.name = source.name
        self.fallback = source.fallback
        self.last: FoodPage | FoodSourceError | None = None
        self.notes: list[str] = []
        self._last_call = 0.0

    def measures(self, source_id: str) -> list[ServingCandidate]:
        return self._source.measures(source_id)

    def search(self, query: str, limit: int, page: int = 1) -> FoodPage:
        wait = PAUSE_SECONDS.get(self.name, 0.0) - (time.monotonic() - self._last_call)
        if wait > 0:
            time.sleep(wait)
        try:
            self.last = self._source.search(query, limit, page)
        except FoodSourceError as error:
            self.last = error
            raise
        finally:
            self.notes = list(getattr(self._source, "notes", []))
            self._last_call = time.monotonic()
        return self.last


def line(candidate: FoodCandidate) -> str:
    brand = f" [{candidate.brand}]" if candidate.brand else ""
    kcal = candidate.nutrients.get("calories")
    per_100 = "?" if kcal is None else f"{kcal:g}"
    if candidate.servings:
        serving = candidate.servings[0]
        scaled = serving_out(serving.label, serving.grams, candidate.nutrients)
        value = scaled.nutrients.get("calories")
        amount = f"{serving.label} = {'?' if value is None else f'{value:g}'} kcal"
    else:
        amount = "no serving"
    plain = " (plain food)" if candidate.is_generic else ""
    return f"{candidate.name}{brand} ({candidate.source}{plain}) | {per_100} kcal/100 g | {amount}"


def main() -> int:
    real: list[FoodSource] = []
    if settings.usda_api_key:
        real.append(UsdaClient(settings.usda_api_key))
    else:
        print("NOTE: no USDA_API_KEY found, so USDA is skipped.", file=sys.stderr)
    # No cool-down here, so every search shows what the service really does.
    real.append(OpenFoodFactsClient(country=settings.open_food_facts_country, cooldown_seconds=0))
    sources = [Recorder(source) for source in real]

    body: list[str] = []
    passed = 0
    gaps = 0
    inconclusive = 0
    # What a failing database actually said, with how many searches it said it for.
    complaints: dict[tuple[str, str], int] = {}
    for query, meaning, pattern in SEARCHES:
        for source in sources:
            source.last = None
            source.notes = []
        ranked, statuses, _ = gather_and_rank(query, list(sources))
        top = ranked[:SHOW]
        ok = any(re.search(pattern, f"{c.name} {c.brand or ''}".lower()) for c in top)
        gap = KNOWN_GAPS.get(query)
        down = any(not status.available for status in statuses)
        if gap and not ok:
            gaps += 1
            verdict = "KNOWN GAP"
        elif down and not ok:
            # The food may only be in the database that was down: says nothing about ranking.
            inconclusive += 1
            verdict = "INCONCLUSIVE (a database was down)"
        else:
            passed += ok
            verdict = "PASS" if ok else "FAIL"
        body.append(f"## {verdict}: {query}\n\nLooking for: {meaning}\n")
        if gap and not ok:
            body.append(f"Known gap, not counted as a failure ({gap}).\n")
        for status in statuses:
            if not status.available:
                body.append(f"- **{status.name} failed:** {status.message}")
        asked = {status.name for status in statuses}
        for source in sources:
            if source.name not in asked:
                body.append(f"- {source.name}: not asked (the main database found enough)")
            body.extend(f"- {source.name} note: {note}" for note in source.notes)
        for number, candidate in enumerate(top, start=1):
            body.append(f"{number}. {line(candidate)}")
        if not ranked:
            body.append("(no results)")
        body.append("\nRaw, before our ranking:")
        for source in sources:
            raw = source.last
            if isinstance(raw, FoodSourceError):
                key = (source.name, f"{raw}; {raw.detail or 'no detail'}")
                complaints[key] = complaints.get(key, 0) + 1
                body.append(f"- {source.name}: failed ({raw}; {raw.detail or 'no detail'})")
            elif raw is not None:
                body.extend(
                    f"- {source.name}: {line(c)}"
                    for c in raw.foods[: RAW_SHOW if ok or gap else RAW_SHOW_FAILED]
                )
        body.append("")
        print(f"{query}: {verdict}", file=sys.stderr)

    print("# Search check\n")
    print(f"Databases: {', '.join(source.name for source in sources)}")
    total = len(SEARCHES) - gaps - inconclusive
    print(f"Result: **{passed} of {total} searches** have the expected food in the top {SHOW}.")
    if inconclusive:
        print(f"Inconclusive, a database was down (not counted; run again later): {inconclusive}.")
    if gaps:
        print(f"Known gaps (listed below, not counted): {gaps}.")
    print()
    if complaints:
        print("## Databases that failed\n")
        for (name, said), count in sorted(complaints.items()):
            print(f"- {name} ({count} searches): {said}")
        print()
    print("\n".join(body))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
