"""Every HTTP endpoint: health checks, users and profile, goals, limits, foods, and the log.

Routes only read the request and call the code that does the work (profiles.py, foods.py,
auth.py, calc/). The health checks are unversioned because Docker and CI expect fixed URLs;
everything else is under /api/v1.
"""

import uuid
from datetime import UTC, date, datetime
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import auth, foods, log, profiles, workouts
from app.auth import CurrentUser
from app.calc.portions import grams_for_text, portion_options
from app.calc.profile_check import limits
from app.db import get_session
from app.schemas import (
    ActivitiesOut,
    AmountIn,
    AmountOut,
    DatabaseHealthResponse,
    DayOut,
    FoodIn,
    FoodOut,
    FoodSearchOut,
    GoalOut,
    HealthResponse,
    LimitsOut,
    LogEntryIn,
    LogEntryOut,
    LogEntryPatch,
    MeasuresOut,
    MonthOut,
    PortionOut,
    PortionsIn,
    PortionsOut,
    ProfileIn,
    ProfileOut,
    ProfileSaved,
    ServingIn,
    UserCreated,
    WeekOut,
    WorkoutIn,
    WorkoutOut,
)
from app.settings import settings
from app.sources import FoodSource, FoodSourceError
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
    scope: Annotated[
        Literal["full", "fast"],
        Query(description="'fast' answers from the main database only (see `more_coming`)"),
    ] = "full",
) -> FoodSearchOut:
    """Your saved foods, then the best matches from the food databases, in one ranked list.

    A database being down never hides the other results. If `has_more` is true, ask again with
    the next `page` for more. The app asks with `scope=fast` first so results show quickly, and,
    when `more_coming` is true, asks again with the default scope to add the slower database
    (the main database's answer is remembered, so that second ask is cheap).
    """
    return foods.search_foods(session, user, q, sources, page, fast=scope == "fast")


@v1.get("/foods/measures", response_model=MeasuresOut, tags=["foods"])
def food_measures(
    user: CurrentUser,
    sources: Annotated[list[FoodSource], Depends(get_food_sources)],
    source: Annotated[str, Query(description="Where the food came from, e.g. 'usda'")],
    source_id: Annotated[str, Query(max_length=40, description="The database's own food id")],
) -> MeasuresOut:
    """A search result's own household measures ("1 medium = 118 g"), to save with the food.

    Ask when someone picks a result, then send the measures along with it in POST /foods.
    """
    chosen = next((item for item in sources if item.name == source), None)
    if chosen is None:
        raise HTTPException(status_code=404, detail="That food database is not available.")
    try:
        found = chosen.measures(source_id)
    except FoodSourceError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return MeasuresOut(servings=[ServingIn(label=m.label, grams=m.grams) for m in found])


@v1.post("/foods/portions", response_model=PortionsOut, tags=["foods"])
def food_portions(data: PortionsIn, user: CurrentUser) -> PortionsOut:
    """The choices for "how much?" for one food: its own servings, rough sizes such as "small
    bowl" (with an estimated weight), and exact units. The phone shows them as a wheel."""
    options = portion_options(data.food_name, [(s.label, s.grams) for s in data.servings])
    return PortionsOut(
        portions=[
            PortionOut(
                label=o.label,
                grams=o.grams,
                kind=o.kind,
                note=o.note,
                quantities=[round(q, 4) for q in o.quantities],
            )
            for o in options
        ]
    )


@v1.post("/amounts/to-grams", response_model=AmountOut, tags=["foods"])
def amount_to_grams(data: AmountIn, user: CurrentUser) -> AmountOut:
    """Turn a typed amount ("1/2 cup flour", "8 oz", "2 bars") into grams.

    Send what is known about the food (its name and servings) so cups and spoons can be worked
    out. If that is not enough, the answer is a 422 with a `code` ("unknown_density" or
    "unknown_serving") rather than a guess.
    """
    grams, amount = grams_for_text(
        data.text, data.food_name, [(item.label, item.grams) for item in data.servings]
    )
    return AmountOut(grams=round(grams, 2), quantity=amount.quantity, unit=amount.unit)


@v1.get("/foods/{food_id}", response_model=FoodOut, tags=["foods"])
def get_food(food_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> FoodOut:
    food = foods.get_food(session, user, food_id)
    if food is None:
        raise HTTPException(status_code=404, detail="food not found")
    return foods.food_out(food)


# --- food log ---


@v1.post("/log", response_model=LogEntryOut, status_code=201, tags=["log"])
def add_log_entry(
    data: LogEntryIn,
    user: CurrentUser,
    session: SessionDep,
    now: Annotated[datetime, Depends(utc_now)],
) -> LogEntryOut:
    """Record that a saved food was eaten (an amount in grams), on today or a given day."""
    return log.entry_out(log.add_entry(session, user, data, now))


@v1.get("/log", response_model=DayOut, tags=["log"])
def get_log_day(
    user: CurrentUser,
    session: SessionDep,
    now: Annotated[datetime, Depends(utc_now)],
    on: Annotated[date | None, Query(alias="date", description="YYYY-MM-DD; default today")] = None,
) -> DayOut:
    """What was eaten on a day, the totals, and the calories left against today's target."""
    today = log.today_for(user, now)
    return log.day(session, user, on or today, today)


@v1.get("/log/week", response_model=WeekOut, tags=["log"])
def get_log_week(
    user: CurrentUser,
    session: SessionDep,
    now: Annotated[datetime, Depends(utc_now)],
    end: Annotated[date | None, Query(description="Last day, YYYY-MM-DD; default today")] = None,
) -> WeekOut:
    """Calories and protein for each of the seven days ending on `end`."""
    return log.week(session, user, end or log.today_for(user, now))


@v1.get("/log/month", response_model=MonthOut, tags=["log"])
def get_log_month(
    user: CurrentUser,
    session: SessionDep,
    now: Annotated[datetime, Depends(utc_now)],
    month: Annotated[
        str | None,
        Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM; default this month"),
    ] = None,
) -> MonthOut:
    """Calories and protein for each day of a month, for the calendar."""
    today = log.today_for(user, now)
    year, number = (int(part) for part in month.split("-")) if month else (today.year, today.month)
    return log.month(session, user, year, number, today)


@v1.patch("/log/{entry_id}", response_model=LogEntryOut, tags=["log"])
def change_log_entry(
    entry_id: uuid.UUID, data: LogEntryPatch, user: CurrentUser, session: SessionDep
) -> LogEntryOut:
    """Change how much of a food an entry holds. Only your own entries (anything else is a 404)."""
    entry = log.change_entry(session, user, entry_id, data)
    if entry is None:
        raise HTTPException(status_code=404, detail="That entry was not found.")
    return log.entry_out(entry)


@v1.delete("/log/{entry_id}", status_code=204, tags=["log"])
def delete_log_entry(entry_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> Response:
    """Remove a mistake. Only your own entries can be removed (anything else is a 404)."""
    if not log.remove_entry(session, user, entry_id):
        raise HTTPException(status_code=404, detail="That entry was not found.")
    return Response(status_code=204)


# --- workouts ---


@v1.get("/workouts/activities", response_model=ActivitiesOut, tags=["workouts"])
def workout_activities(user: CurrentUser) -> ActivitiesOut:
    """The activities and intensities a workout can be logged with."""
    return workouts.activities_out()


@v1.post("/workouts", response_model=WorkoutOut, status_code=201, tags=["workouts"])
def add_workout(
    data: WorkoutIn,
    user: CurrentUser,
    session: SessionDep,
    now: Annotated[datetime, Depends(utc_now)],
) -> WorkoutOut:
    """Log a workout. Calories are estimated from the person's weight unless they are sent."""
    today = log.today_for(user, now)
    return workouts.workout_out(workouts.add_workout(session, user, data, today))


@v1.put("/workouts/{workout_id}", response_model=WorkoutOut, tags=["workouts"])
def change_workout(
    workout_id: uuid.UUID,
    data: WorkoutIn,
    user: CurrentUser,
    session: SessionDep,
    now: Annotated[datetime, Depends(utc_now)],
) -> WorkoutOut:
    """Change a workout (what, how long, how hard, calories). It stays on its day unless moved."""
    today = log.today_for(user, now)
    changed = workouts.change_workout(session, user, workout_id, data, today)
    if changed is None:
        raise HTTPException(status_code=404, detail="workout not found")
    return workouts.workout_out(changed)


@v1.delete("/workouts/{workout_id}", status_code=204, tags=["workouts"])
def delete_workout(workout_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> Response:
    if not workouts.remove_workout(session, user, workout_id):
        raise HTTPException(status_code=404, detail="workout not found")
    return Response(status_code=204)
