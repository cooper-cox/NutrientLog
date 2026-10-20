"""Foods: saving one, looking one up, and searching saved foods plus the outside databases."""

import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.calc.food_check import check_food, clean_text
from app.calc.food_names import brand_key
from app.calc.food_rank import Rankable, duplicate_key, full_matches, rank, words
from app.calc.goals import InvalidInputError, Problem
from app.calc.nutrients import KEYS, energy_mismatch, scale_nutrients
from app.models import Food, FoodNutrient, FoodServing, User
from app.schemas import (
    FoodCandidateOut,
    FoodIn,
    FoodOut,
    FoodSearchOut,
    ServingOut,
    SourceStatus,
)
from app.settings import settings
from app.sources import FoodCandidate, FoodPage, FoodSource, FoodSourceError


def _save_food(session: Session, food: Food) -> Food:
    session.add(food)
    session.flush()
    return food


def find_visible(session: Session, user_id: uuid.UUID, food_id: uuid.UUID) -> Food | None:
    """A food this user may see: their own, or a shared one (no owner)."""
    statement = select(Food).where(
        Food.id == food_id, (Food.owner_user_id == user_id) | Food.owner_user_id.is_(None)
    )
    return session.scalar(statement)


def _find_saved(session: Session, user_id: uuid.UUID, source: str, source_id: str) -> Food | None:
    statement = select(Food).where(
        Food.owner_user_id == user_id, Food.source == source, Food.source_id == source_id
    )
    return session.scalars(statement).first()


def _saved_source_ids(session: Session, user_id: uuid.UUID, source: str) -> set[str]:
    statement = select(Food.source_id).where(
        Food.owner_user_id == user_id, Food.source == source, Food.source_id.is_not(None)
    )
    return {value for value in session.scalars(statement) if value is not None}


def _escape_like(word: str) -> str:
    return word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _search_saved(session: Session, user_id: uuid.UUID, words: list[str], limit: int) -> list[Food]:
    """Foods the user can see whose name or brand contains every word (any case).

    Foods whose name starts with the first word come first, then alphabetical.
    """
    text = func.concat_ws(" ", Food.name, Food.brand)
    statement = select(Food).where((Food.owner_user_id == user_id) | Food.owner_user_id.is_(None))
    for word in words:
        statement = statement.where(text.ilike(f"%{_escape_like(word)}%", escape="\\"))
    starts_with = case((Food.name.ilike(f"{_escape_like(words[0])}%", escape="\\"), 0), else_=1)
    statement = statement.order_by(starts_with, func.lower(Food.name), Food.id).limit(limit)
    return list(session.scalars(statement))


SAVED_LIMIT = settings.search.saved_limit
SOURCE_LIMIT = settings.search.source_limit  # per outside database, per page
# Fewer close matches than this from the main databases: also ask the fallback database.
ENOUGH_FULL_MATCHES = settings.search.enough_full_matches
# A long query ("peanut butter clif bar") names one specific product, which the community
# database often has when USDA lists only lookalikes, so the fallback is asked for those too.
LONG_QUERY_WORDS = settings.search.long_query_words
MIN_QUERY_LENGTH = settings.search.min_query_length
MAX_QUERY_LENGTH = settings.search.max_query_length


def serving_out(label: str, grams: float, per_100g: dict[str, float | None]) -> ServingOut:
    """A serving with what it contains, so the app never has to do nutrition maths."""
    scaled = scale_nutrients(per_100g, grams)
    return ServingOut(
        label=label,
        grams=grams,
        nutrients={
            key: None if value is None else round(value, 1) for key, value in scaled.items()
        },
    )


def food_out(food: Food) -> FoodOut:
    """The food as the API returns it: every tracked nutrient present, unknown ones as null."""
    known = {row.nutrient_key: row.amount_per_100g for row in food.nutrients}
    per_100g = {key: known.get(key) for key in KEYS}
    return FoodOut(
        id=food.id,
        name=food.name,
        brand=food.brand,
        barcode=food.barcode,
        source=food.source,
        source_id=food.source_id,
        is_estimated=food.is_estimated,
        kind=food.kind,
        nutrients=per_100g,
        servings=[serving_out(s.label, s.grams, per_100g) for s in food.servings],
        created_at=food.created_at,
    )


def candidate_out(candidate: FoodCandidate) -> FoodCandidateOut:
    return FoodCandidateOut(
        source=candidate.source,
        source_id=candidate.source_id,
        name=candidate.name,
        brand=candidate.brand,
        barcode=candidate.barcode,
        nutrients=candidate.nutrients,
        servings=[serving_out(s.label, s.grams, candidate.nutrients) for s in candidate.servings],
    )


def create_food(session: Session, user: User, data: FoodIn) -> tuple[Food, bool]:
    """Check and save a food for this user. Returns (food, was_new).

    Saving a USDA food the user already has returns the existing one instead of a duplicate.
    """
    name = clean_text(data.name)
    brand = clean_text(data.brand)
    barcode = clean_text(data.barcode)
    servings = [(clean_text(item.label) or "", item.grams) for item in data.servings]
    check_food(name, brand, data.nutrients, servings)
    assert name is not None  # check_food rejects a missing name

    source_id = clean_text(data.source_id)
    if data.source != "manual" and source_id is None:
        raise InvalidInputError([Problem("source_id", "A food from USDA needs its USDA id.")])
    if data.source == "manual":
        source_id = None
    if source_id is not None:
        existing = _find_saved(session, user.id, data.source, source_id)
        if existing is not None:
            return existing, False

    food = Food(
        id=uuid.uuid4(),
        owner_user_id=user.id,
        name=name,
        brand=brand,
        barcode=barcode,
        source=data.source,
        source_id=source_id,
        nutrients=[
            FoodNutrient(nutrient_key=key, amount_per_100g=value)
            for key, value in data.nutrients.items()
            if value is not None
        ],
        servings=[
            FoodServing(label=label, grams=grams, position=position)
            for position, (label, grams) in enumerate(servings)
        ],
    )
    _save_food(session, food)
    session.commit()
    session.refresh(food)
    return food, True


def get_food(session: Session, user: User, food_id: uuid.UUID) -> Food | None:
    return find_visible(session, user.id, food_id)


def _barcode_key(candidate: FoodCandidate) -> str | None:
    """A barcode with leading zeros removed (UPC-A and EAN-13 write the same code differently)."""
    digits = (candidate.barcode or "").strip().lstrip("0")
    return digits or None


def _known(candidate: FoodCandidate) -> int:
    return sum(value is not None for value in candidate.nutrients.values())


def merge_duplicates(candidates: list[FoodCandidate]) -> list[FoodCandidate]:
    """The same product from two databases (same barcode) appears once: the one with more data.

    Order is kept (the surviving copy sits where its first copy was).
    """
    best: dict[str, FoodCandidate] = {}
    for candidate in candidates:
        key = _barcode_key(candidate)
        if key is not None and (key not in best or _known(candidate) > _known(best[key])):
            best[key] = candidate
    merged: list[FoodCandidate] = []
    placed: set[str] = set()
    for candidate in candidates:
        key = _barcode_key(candidate)
        if key is None:
            merged.append(candidate)
        elif key not in placed:
            placed.add(key)
            merged.append(best[key])
    return merged


def _same_label(candidate: FoodCandidate) -> tuple[object, ...] | None:
    """What a package label says: brand, serving size and calories, protein, fat, carbs (rounded).

    Two packaged products from the same brand with the same label are the same product to the
    person, however the database words the name ("Nut Butter Bar, Peanut Butter" and "Peanut
    Butter Nut Butter Bar"). Returns None when there is no brand or the numbers are missing.
    """
    brand = brand_key(candidate.brand)
    nutrients = [candidate.nutrients.get(k) for k in ("calories", "protein_g", "fat_g", "carb_g")]
    if brand is None or any(value is None for value in nutrients):
        return None
    serving = candidate.servings[0].grams if candidate.servings else None
    return (
        brand,
        *(round(value or 0.0) for value in nutrients),
        None if serving is None else round(serving),
    )


def collapse_lookalikes(candidates: list[FoodCandidate]) -> list[FoodCandidate]:
    """Keep one of results that are the same product listed more than once.

    The database holds one record per package size ("12 OUNCE", "28 Ounce") with identical
    nutrition; showing all of them would fill the screen with the same food. A plain food
    with the same name in several USDA datasets is also shown once (the first one listed), and
    packaged products with the same brand and the same label show once, under the shortest name.
    """
    seen: set[object] = set()
    kept: list[FoodCandidate] = []
    label_at: dict[object, int] = {}
    for candidate in candidates:
        serving = candidate.servings[0].grams if candidate.servings else None
        key: object = duplicate_key(
            candidate.name, candidate.brand, candidate.nutrients.get("calories"), serving
        )
        if candidate.is_generic:
            # USDA's separate datasets each list "Broccoli, raw" with slightly different numbers.
            key = ("plain food", candidate.name.lower())
        if key in seen:
            continue
        seen.add(key)
        label = None if candidate.is_generic else _same_label(candidate)
        if label is not None and label in label_at:
            index = label_at[label]
            if len(words(candidate.name)) < len(words(kept[index].name)):
                kept[index] = candidate  # the simpler name takes the place of the first copy
            continue
        if label is not None:
            label_at[label] = len(kept)
        kept.append(candidate)
    return kept


def _ask_one(source: FoodSource, text: str, page: int) -> tuple[FoodPage | FoodSourceError, int]:
    started = time.monotonic()
    try:
        result: FoodPage | FoodSourceError = source.search(text, SOURCE_LIMIT, page)
    except FoodSourceError as error:
        result = error
    return result, round((time.monotonic() - started) * 1000)


def _ask_all(
    sources: list[FoodSource],
    text: str,
    page: int,
    statuses: list[SourceStatus],
    wait_seconds: float,
) -> tuple[list[tuple[FoodCandidate, int]], bool]:
    """Ask every source at the same time and wait at most `wait_seconds` for all of them.

    A source that fails, or has not answered in time, is reported and skipped; the others carry
    on. (A slow answer is left to finish in the background, and is remembered for next time.)
    """
    pairs: list[tuple[FoodCandidate, int]] = []
    has_more = False
    if not sources:
        return pairs, has_more
    pool = ThreadPoolExecutor(max_workers=len(sources))
    try:
        futures = [(source, pool.submit(_ask_one, source, text, page)) for source in sources]
        give_up_at = time.monotonic() + wait_seconds
        for source, future in futures:
            try:
                outcome, took_ms = future.result(timeout=max(give_up_at - time.monotonic(), 0.0))
            except FutureTimeout:
                statuses.append(
                    SourceStatus(
                        name=source.name,
                        available=False,
                        message="It was too slow, so its results were left out this time.",
                        took_ms=round(wait_seconds * 1000),
                    )
                )
                continue
            if isinstance(outcome, FoodSourceError):
                statuses.append(
                    SourceStatus(
                        name=source.name,
                        available=False,
                        message=str(outcome),
                        took_ms=took_ms,
                    )
                )
                continue
            statuses.append(SourceStatus(name=source.name, available=True, took_ms=took_ms))
            pairs.extend((food, position) for position, food in enumerate(outcome.foods))
            has_more = has_more or outcome.has_more
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    return pairs, has_more


def _order(text: str, pairs: list[tuple[FoodCandidate, int]]) -> list[FoodCandidate]:
    """Merge the same barcode and the same product, then rank everything as one list."""
    position = {id(candidate): place for candidate, place in pairs}
    unique = collapse_lookalikes(merge_duplicates([candidate for candidate, _ in pairs]))
    items = [
        Rankable(
            c.name,
            c.brand,
            bool(c.servings),
            position[id(c)],
            is_generic=c.is_generic,
            energy_mismatch=energy_mismatch(c.nutrients),
        )
        for c in unique
    ]
    return [unique[index] for index in rank(text, items)]


def wants_fallback(
    text: str, ranked: list[FoodCandidate], sources: list[FoodSource], page: int
) -> bool:
    """Would the fallback database be asked? Only on page 1, only if there is one, and only for
    a long query (a specific product) or when the main databases found few close matches."""
    if page != 1 or not any(source.fallback for source in sources):
        return False
    return (
        len(words(text)) >= LONG_QUERY_WORDS or full_matches_in(text, ranked) < ENOUGH_FULL_MATCHES
    )


def gather_and_rank(
    text: str,
    sources: list[FoodSource],
    page: int = 1,
    deadline_seconds: float | None = None,
    fast: bool = False,
) -> tuple[list[FoodCandidate], list[SourceStatus], bool]:
    """Ask the databases, merge duplicates, and order everything as one list (best first).

    All databases that are certain to be needed are asked at once. A fallback database (slower,
    limits how often it can be asked) is only used on the first page: at once for a long query
    (it names one specific product), otherwise only after the main databases found fewer than
    ENOUGH_FULL_MATCHES results containing every typed word (see `wants_fallback`). The whole
    search gives up waiting after `deadline_seconds` (default from config.toml) and returns what
    it has. With `fast`, the fallback is never asked, so the answer takes only as long as the
    main databases.
    Needs no database of our own, so the real-data check script can use it too.
    """
    started = time.monotonic()
    budget = settings.search.deadline_seconds if deadline_seconds is None else deadline_seconds
    statuses: list[SourceStatus] = []
    main = [s for s in sources if not s.fallback]
    fallbacks = [s for s in sources if s.fallback] if page == 1 and not fast else []
    long_query = len(words(text)) >= LONG_QUERY_WORDS
    together = fallbacks if long_query else []

    pairs, has_more = _ask_all(main + together, text, page, statuses, budget)
    ranked = _order(text, pairs)

    later = [] if long_query else fallbacks
    if later and wants_fallback(text, ranked, later, page):
        left = max(budget - (time.monotonic() - started), 1.0)
        more, more_has = _ask_all(later, text, page, statuses, left)
        pairs = pairs + more
        ranked = _order(text, pairs)
        has_more = has_more or more_has
    return ranked, statuses, has_more


def full_matches_in(text: str, ranked: list[FoodCandidate]) -> int:
    return full_matches(text, [Rankable(c.name, c.brand, False, 0) for c in ranked])


def search_foods(
    session: Session,
    user: User,
    query: str,
    sources: list[FoodSource],
    page: int = 1,
    fast: bool = False,
) -> FoodSearchOut:
    """The user's saved foods, then the best matches from every outside database, ranked as one.

    Page 1 has both. Later pages ("show more") only add further outside results.
    """
    words = query.split()
    text = " ".join(words)
    if len(text) < MIN_QUERY_LENGTH or len(text) > MAX_QUERY_LENGTH:
        raise InvalidInputError(
            [Problem("q", f"Type {MIN_QUERY_LENGTH} to {MAX_QUERY_LENGTH} characters to search.")]
        )

    saved = (
        [food_out(food) for food in _search_saved(session, user.id, words, SAVED_LIMIT)]
        if page == 1
        else []
    )
    ranked, statuses, has_more = gather_and_rank(text, sources, page, fast=fast)
    already = {source.name: _saved_source_ids(session, user.id, source.name) for source in sources}
    results = [
        candidate_out(candidate)
        for candidate in ranked
        if candidate.source_id not in already.get(candidate.source, set())
    ]
    return FoodSearchOut(
        saved=saved,
        results=results,
        sources=statuses,
        has_more=has_more,
        more_coming=fast and wants_fallback(text, ranked, sources, page),
    )
