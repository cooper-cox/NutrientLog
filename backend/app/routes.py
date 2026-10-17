"""Every HTTP endpoint: health checks, users and profile, goals, limits, and foods.

Routes only read the request and call the code that does the work (profiles.py, foods.py,
auth.py, calc/). The health checks are unversioned because Docker and CI expect fixed URLs;
everything else is under /api/v1.
"""

import uuid
from datetime import UTC, datetime
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import auth, foods, profiles
from app.auth import CurrentUser
from app.calc.profile_check import limits
from app.db import get_session
from app.schemas import (
    DatabaseHealthResponse,
    FoodIn,
    FoodOut,
    FoodSearchOut,
    GoalOut,
    HealthResponse,
    LimitsOut,
    ProfileIn,
    ProfileOut,
    ProfileSaved,
    UserCreated,
)
from app.settings import settings
from app.sources import FoodSource
from app.sources.openfoodfacts import OpenFoodFactsClient
from app.sources.usda import UsdaClient


def utc_now() -> datetime:
    """The current time. A dependency, so tests can replace it with a fixed time."""
    return datetime.now(UTC)


SessionDep = Annotated[Session, Depends(get_session)]

health_router = APIRouter(tags=["health"])
v1 = APIRouter(prefix="/api/v1")


# --- health (unversioned) ---


@health_router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Is the API process up? Does not touch the database."""
    return HealthResponse(status="ok")


@health_router.get("/health/db", response_model=DatabaseHealthResponse)
def health_db(session: SessionDep) -> DatabaseHealthResponse:
    """Can the API reach the database?"""
    try:
        session.execute(text("SELECT 1"))  # the cheapest possible query
    except SQLAlchemyError as error:
        raise HTTPException(status_code=503, detail="database unreachable") from error
    return DatabaseHealthResponse(status="ok", database="reachable")


# --- users, profile, goals, limits ---


@v1.post("/users", response_model=UserCreated, status_code=201, tags=["users"])
def create_user(session: SessionDep) -> UserCreated:
    """Create an anonymous user. Keep the returned token: it is shown only once."""
    user, token = auth.create_anonymous_user(session)
    return UserCreated(user_id=user.id, token=token)


@v1.get("/users/me/profile", response_model=ProfileOut, tags=["users"])
def get_profile(user: CurrentUser) -> ProfileOut:
    """The saved profile. A 404 means onboarding isn't finished yet."""
    profile = profiles.get_profile(user)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not set")
    return profile


@v1.put("/users/me/profile", response_model=ProfileSaved, tags=["users"])
def save_profile(
    data: ProfileIn,
    user: CurrentUser,
    session: SessionDep,
    now: Annotated[datetime, Depends(utc_now)],
) -> ProfileSaved:
    """Save the survey answers and calculate a new goal from them."""
    goal = profiles.save_profile(session, user, data, now)
    profile = profiles.get_profile(user)
    assert profile is not None  # save_profile always sets it
    return ProfileSaved(profile=profile, goal=profiles.goal_out(goal, user))


@v1.get("/goals/current", response_model=GoalOut, tags=["goals"])
def get_current_goal(user: CurrentUser, session: SessionDep) -> GoalOut:
    """The calorie and macro targets in effect now. A 404 means no profile has been saved yet."""
    goal = profiles.get_current_goal(session, user)
    if goal is None:
        raise HTTPException(status_code=404, detail="no goal yet; save a profile first")
    return profiles.goal_out(goal, user)


@v1.get("/limits", response_model=LimitsOut, tags=["limits"])
def get_limits() -> LimitsOut:
    """The limits the survey answers are checked against, so the app can check as people type.

    The server still checks everything again when the survey is saved. These numbers are the same
    ones it uses, so the app never has its own copy of them.
    """
    return LimitsOut.model_validate(limits())


# --- foods ---


@lru_cache
def _usda_client(api_key: str) -> UsdaClient:
    return UsdaClient(api_key)


@lru_cache
def _off_client() -> OpenFoodFactsClient:
    return OpenFoodFactsClient(country=settings.open_food_facts_country)


def get_food_sources() -> list[FoodSource]:
    """The outside food databases that are switched on (USDA needs a key; the other does not)."""
    sources: list[FoodSource] = []
    if settings.usda_api_key:
        sources.append(_usda_client(settings.usda_api_key))
    if settings.open_food_facts:
        sources.append(_off_client())
    return sources


@v1.post("/foods", response_model=FoodOut, status_code=201, tags=["foods"])
def create_food(
    data: FoodIn, user: CurrentUser, session: SessionDep, response: Response
) -> FoodOut:
    """Save a food (typed in by hand, or a USDA result chosen from a search).

    Nutrients are per 100 g; any left out are "unknown", not zero. Saving a USDA food that is
    already saved returns the existing one with status 200 instead of making a duplicate.
    """
    food, was_new = foods.create_food(session, user, data)
    if not was_new:
        response.status_code = 200
    return foods.food_out(food)


@v1.get("/foods/search", response_model=FoodSearchOut, tags=["foods"])
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
    return foods.search_foods(session, user, q, sources, page)


@v1.get("/foods/{food_id}", response_model=FoodOut, tags=["foods"])
def get_food(food_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> FoodOut:
    food = foods.get_food(session, user, food_id)
    if food is None:
        raise HTTPException(status_code=404, detail="food not found")
    return foods.food_out(food)
