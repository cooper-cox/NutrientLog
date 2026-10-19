"""A search must be quick: databases are asked at the same time, slow ones are skipped, and an
identical search is answered from memory."""

import time

import httpx
import pytest

from app.foods import gather_and_rank
from app.sources import FoodCandidate, FoodPage, FoodSourceError, SearchCache
from app.sources.usda import UsdaClient


def food(source: str, number: int, name: str) -> FoodCandidate:
    return FoodCandidate(
        source=source,
        source_id=str(number),
        name=name,
        brand=None,
        barcode=None,
        nutrients={"calories": 100.0},
        is_generic=True,
    )


class Slow:
    """A pretend database that answers after a delay (or fails after it)."""

    def __init__(
        self, name: str, delay: float, names: list[str], fallback: bool = False, fail: bool = False
    ) -> None:
        self.name = name
        self.fallback = fallback
        self.delay = delay
        self.names = names
        self.fail = fail
        self.calls = 0

    def search(self, query: str, limit: int, page: int = 1) -> FoodPage:
        self.calls += 1
        time.sleep(self.delay)
        if self.fail:
            raise FoodSourceError("down")
        return FoodPage([food(self.name, i, n) for i, n in enumerate(self.names)], False)

    def measures(self, source_id: str) -> list:  # type: ignore[type-arg]
        return []


def timed(*args: object, **kwargs: object) -> tuple[float, tuple]:  # type: ignore[type-arg]
    start = time.monotonic()
    result = gather_and_rank(*args, **kwargs)  # type: ignore[arg-type]
    return time.monotonic() - start, result


def test_two_databases_are_asked_at_the_same_time() -> None:
    a = Slow("usda", 0.3, ["Peanut butter clif bar"])
    b = Slow("off", 0.3, ["Peanut butter clif bar crunchy"], fallback=True)
    # Three words: the fallback is certain to be needed, so it must not wait for the first.
    took, (ranked, statuses, _) = timed("peanut butter clif", [a, b], deadline_seconds=3)
    assert took < 0.55
    assert {s.name for s in statuses if s.available} == {"usda", "off"}
    assert len(ranked) == 2


def test_a_short_search_that_found_plenty_never_asks_the_fallback() -> None:
    names = [f"Banana {i}" for i in range(8)]
    a = Slow("usda", 0.0, names)
    b = Slow("off", 0.0, ["Banana chips"], fallback=True)
    gather_and_rank("banana", [a, b])
    assert a.calls == 1 and b.calls == 0


def test_a_thin_short_search_asks_the_fallback_afterwards() -> None:
    a = Slow("usda", 0.0, ["Banana"])
    b = Slow("off", 0.0, ["Banana chips"], fallback=True)
    ranked, statuses, _ = gather_and_rank("banana", [a, b])
    assert b.calls == 1 and len(ranked) == 2
    assert [s.name for s in statuses] == ["usda", "off"]


def test_a_slow_database_is_skipped_and_the_rest_is_returned_in_time() -> None:
    quick = Slow("usda", 0.0, ["Peanut butter"])
    stuck = Slow("off", 3.0, ["Peanut butter bar"], fallback=True)
    took, (ranked, statuses, _) = timed("peanut butter", [quick, stuck], deadline_seconds=0.3)
    assert took < 1.5  # gave up at the deadline instead of waiting 3 seconds
    assert [food.name for food in ranked] == ["Peanut butter"]
    skipped = next(s for s in statuses if s.name == "off")
    assert skipped.available is False and "too slow" in (skipped.message or "")


def test_the_whole_search_is_capped_even_when_both_stages_are_slow() -> None:
    main = Slow("usda", 0.4, ["Egg"])
    stuck = Slow("off", 5.0, ["Egg bar"], fallback=True)
    took, (ranked, _, _) = timed("egg", [main, stuck], deadline_seconds=1.0)
    assert took < 2.2  # the fallback gets what is left of the budget (at least one second)
    assert [food.name for food in ranked] == ["Egg"]


def test_a_failing_database_is_reported_with_how_long_it_took() -> None:
    broken = Slow("usda", 0.05, [], fail=True)
    ranked, statuses, _ = gather_and_rank("apple", [broken])
    assert ranked == []
    assert statuses[0].available is False and statuses[0].message == "down"
    assert statuses[0].took_ms is not None and statuses[0].took_ms >= 40


def test_every_reply_says_how_long_each_database_took() -> None:
    _, statuses, _ = gather_and_rank("apple", [Slow("usda", 0.05, ["Apple"])])
    assert statuses[0].available and statuses[0].took_ms is not None and statuses[0].took_ms >= 40


# --- the memory of recent searches ---


def test_the_cache_returns_what_it_was_given_until_it_expires() -> None:
    cache = SearchCache(seconds=0.2)
    page = FoodPage([food("usda", 1, "Apple")], True)
    assert cache.get("k") is None
    cache.put("k", page)
    again = cache.get("k")
    assert again is not None and again.has_more is True and again.foods == page.foods
    time.sleep(0.3)
    assert cache.get("k") is None


def test_a_cache_set_to_zero_remembers_nothing() -> None:
    cache = SearchCache(seconds=0)
    cache.put("k", FoodPage([], False))
    assert cache.get("k") is None


def test_the_cache_stays_small_by_dropping_the_oldest() -> None:
    cache = SearchCache(seconds=60, max_items=2)
    for key in ("a", "b", "c"):
        cache.put(key, FoodPage([], False))
        time.sleep(0.01)
    assert cache.get("a") is None and cache.get("b") is not None and cache.get("c") is not None


def usda_counting(calls: list[int], seconds: float = 60, code: int = 200) -> UsdaClient:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(code, json={"foods": []})

    http = httpx.Client(transport=httpx.MockTransport(handler))
    return UsdaClient(
        "k", base_url="https://example.test/v1", client=http, retry_waits=(), cache_seconds=seconds
    )


def test_asking_usda_the_same_thing_twice_uses_the_memory() -> None:
    calls: list[int] = []
    client = usda_counting(calls)
    client.search("Banana", 50)
    first = len(calls)
    client.search("banana", 50)  # same words, other capitals
    assert len(calls) == first
    client.search("banana", 50, page=2)  # another page is another question
    assert len(calls) > first


def test_with_the_memory_off_usda_is_asked_every_time() -> None:
    calls: list[int] = []
    client = usda_counting(calls, seconds=0)
    client.search("banana", 50)
    first = len(calls)
    client.search("banana", 50)
    assert len(calls) == 2 * first


def test_a_failed_search_is_not_remembered() -> None:
    calls: list[int] = []
    client = usda_counting(calls, code=403)
    for _ in range(2):
        with pytest.raises(FoodSourceError):
            client.search("banana", 50)
    assert len(calls) == 8  # four requests per search, none remembered
