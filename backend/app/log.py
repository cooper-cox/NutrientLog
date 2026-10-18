"""The food log: adding what was eaten, listing a day, and removing a mistake.

Every question is scoped to the signed-in user, so one person can never see or change another's
entries. A day is the person's own calendar day (their saved timezone).
"""

import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import profiles
from app.calc import dates
from app.calc.goals import InvalidInputError, Problem
from app.calc.nutrients import KEYS, scale_nutrients, sum_nutrients
from app.foods import find_visible
from app.models import Food, LogEntry, User
from app.schemas import DayOut, LogEntryIn, LogEntryOut
from app.settings import settings


def _per_100g(food: Food) -> dict[str, float | None]:
    known = {row.nutrient_key: row.amount_per_100g for row in food.nutrients}
    return {key: known.get(key) for key in KEYS}


def entry_out(entry: LogEntry) -> LogEntryOut:
    food = entry.food
    return LogEntryOut(
        id=entry.id,
        food_id=food.id,
        food_name=food.name,
        brand=food.brand,
        logged_on=entry.logged_on,
        grams=entry.grams,
        amount_text=entry.amount_text,
        nutrients=scale_nutrients(_per_100g(food), entry.grams),
        created_at=entry.created_at,
    )


def today_for(user: User, now: datetime) -> date:
    """The person's calendar day right now (UTC's day until they have saved a profile)."""
    return dates.local_today(user.timezone or "UTC", now)


def add_entry(session: Session, user: User, data: LogEntryIn, now: datetime) -> LogEntry:
    if data.grams > settings.food.max_serving_grams:
        raise InvalidInputError([Problem("grams", "That is more food than one entry can hold.")])
    food = find_visible(session, user.id, data.food_id)
    if food is None:
        raise InvalidInputError([Problem("food_id", "That food is not in your saved foods.")])
    today = today_for(user, now)
    logged_on = data.logged_on or today
    if abs((logged_on - today).days) > 366:
        raise InvalidInputError([Problem("logged_on", "That date is too far from today.")])
    text = (data.amount_text or "").strip() or None
    entry = LogEntry(
        id=uuid.uuid4(),
        user_id=user.id,
        food_id=food.id,
        logged_on=logged_on,
        grams=data.grams,
        amount_text=text,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def day(session: Session, user: User, on: date) -> DayOut:
    statement = (
        select(LogEntry)
        .where(LogEntry.user_id == user.id, LogEntry.logged_on == on)
        .order_by(LogEntry.created_at, LogEntry.id)
    )
    entries = [entry_out(entry) for entry in session.scalars(statement)]
    totals = sum_nutrients(entry.nutrients for entry in entries)
    goal = profiles.get_current_goal(session, user)
    eaten = totals.get("calories") or 0.0
    return DayOut(
        date=on,
        entries=entries,
        totals={key: totals.get(key) for key in KEYS},
        goal_calories=goal.calories if goal else None,
        remaining_calories=goal.calories - eaten if goal else None,
    )


def remove_entry(session: Session, user: User, entry_id: uuid.UUID) -> bool:
    entry = session.scalar(
        select(LogEntry).where(LogEntry.id == entry_id, LogEntry.user_id == user.id)
    )
    if entry is None:
        return False
    session.delete(entry)
    session.commit()
    return True
