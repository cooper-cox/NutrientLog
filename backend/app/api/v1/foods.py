import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_food_sources
from app.core.db import get_session
from app.integrations.base import FoodSource
from app.schemas.food import FoodIn, FoodOut, FoodSearchOut
from app.services import foods as foods_service

router = APIRouter(prefix="/foods", tags=["foods"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.post("", response_model=FoodOut, status_code=201)
def create_food(
    data: FoodIn, user: CurrentUser, session: SessionDep, response: Response
) -> FoodOut:
    """Save a food (typed in by hand, or a USDA result chosen from a search).

    Nutrients are per 100 g; any left out are "unknown", not zero. Saving a USDA food that is
    already saved returns the existing one with status 200 instead of making a duplicate.
    """
    food, was_new = foods_service.create_food(session, user, data)
    if not was_new:
        response.status_code = 200
    return foods_service.food_out(food)


@router.get("/search", response_model=FoodSearchOut)
def search_foods(
    user: CurrentUser,
    session: SessionDep,
    sources: Annotated[list[FoodSource], Depends(get_food_sources)],
    q: Annotated[str, Query(description="Words to look for, e.g. 'clif bar'")] = "",
    page: Annotated[
        int, Query(ge=1, le=100, description="1 for the first results; 2, 3... for 'show more'")
    ] = 1,
) -> FoodSearchOut:
    """Your saved foods, then the best matches from the food databases, in one ranked list.

    A database being down never hides the other results. If `has_more` is true, ask again with
    the next `page` for more.
    """
    return foods_service.search_foods(session, user, q, sources, page)


@router.get("/{food_id}", response_model=FoodOut)
def get_food(food_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> FoodOut:
    food = foods_service.get_food(session, user, food_id)
    if food is None:
        raise HTTPException(status_code=404, detail="food not found")
    return foods_service.food_out(food)
