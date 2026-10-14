import uuid

from sqlalchemy.orm import Session

from app.calc.calorie_target import InvalidInputError, Problem
from app.calc.food_check import check_food, clean_text
from app.calc.nutrient_catalog import KEYS
from app.integrations.base import FoodCandidate, FoodSource, FoodSourceError
from app.models import Food, FoodNutrient, FoodServing, User
from app.repositories import foods as foods_repo
from app.schemas.food import FoodCandidateOut, FoodIn, FoodOut, FoodSearchOut, ServingOut

SAVED_LIMIT = 25
USDA_LIMIT = 50
MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 100


def food_out(food: Food) -> FoodOut:
    """The food as the API returns it: every tracked nutrient present, unknown ones as null."""
    known = {row.nutrient_key: row.amount_per_100g for row in food.nutrients}
    return FoodOut(
        id=food.id,
        name=food.name,
        brand=food.brand,
        barcode=food.barcode,
        source=food.source,
        source_id=food.source_id,
        is_estimated=food.is_estimated,
        kind=food.kind,
        nutrients={key: known.get(key) for key in KEYS},
        servings=[ServingOut(label=s.label, grams=s.grams) for s in food.servings],
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
        servings=[ServingOut(label=s.label, grams=s.grams) for s in candidate.servings],
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
        existing = foods_repo.find_by_source(session, user.id, data.source, source_id)
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
    foods_repo.add(session, food)
    session.commit()
    session.refresh(food)
    return food, True


def get_food(session: Session, user: User, food_id: uuid.UUID) -> Food | None:
    return foods_repo.get_for_user(session, user.id, food_id)


def search_foods(
    session: Session, user: User, query: str, source: FoodSource | None, page: int = 1
) -> FoodSearchOut:
    """The user's saved foods first, then more from USDA (if it is switched on and answering).

    Page 1 has both. Later pages ("show more") only add further USDA results.
    """
    words = query.split()
    text = " ".join(words)
    if len(text) < MIN_QUERY_LENGTH or len(text) > MAX_QUERY_LENGTH:
        raise InvalidInputError(
            [Problem("q", f"Type {MIN_QUERY_LENGTH} to {MAX_QUERY_LENGTH} characters to search.")]
        )

    saved = (
        [food_out(food) for food in foods_repo.search(session, user.id, words, SAVED_LIMIT)]
        if page == 1
        else []
    )
    if source is None:
        return FoodSearchOut(saved=saved, usda=[], usda_available=False)

    try:
        found = source.search(text, USDA_LIMIT, page)
    except FoodSourceError as error:
        return FoodSearchOut(saved=saved, usda=[], usda_available=True, usda_message=str(error))
    already = foods_repo.saved_source_ids(session, user.id, source.name)
    fresh = [candidate for candidate in found.foods if candidate.source_id not in already]
    return FoodSearchOut(
        saved=saved,
        usda=[candidate_out(candidate) for candidate in fresh],
        usda_available=True,
        usda_has_more=found.has_more,
    )
