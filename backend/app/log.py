"""The food log: adding what was eaten, listing a day, and removing a mistake.

Every question is scoped to the signed-in user, so one person can never see or change another's
entries. A day is the person's own calendar day (their saved timezone).
"""

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import profiles, workouts
from app.calc import dates
from app.calc.goals import InvalidInputError, Problem
from app.calc.nutrients import KEYS, scale_nutrients, sum_nutrients
from app.calc.portions import grams_for_text
from app.foods import find_visible
from app.models import Food, LogEntry, User
from app.schemas import (
    BurnedOut,
    DayOut,
    LogEntryIn,
    LogEntryOut,
    LogEntryPatch,
    MonthOut,
    WeekDayOut,
    WeekOut,
)
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


def day(session: Session, user: User, on: date, today: date) -> DayOut:
    statement = (
        select(LogEntry)
        .where(LogEntry.user_id == user.id, LogEntry.logged_on == on)
        .order_by(LogEntry.created_at, LogEntry.id)
    )
    entries = [entry_out(entry) for entry in session.scalars(statement)]
    totals = sum_nutrients(entry.nutrients for entry in entries)
    goal = profiles.get_current_goal(session, user)
    eaten = totals.get("calories") or 0.0
    done = [workouts.workout_out(w) for w in workouts.for_day(session, user, on)]
    workout_total = round(sum(w.calories for w in done), 1)
    resting = round(goal.bmr) if goal else None
    burned = BurnedOut(
        resting=resting, workouts=workout_total, total=(resting or 0) + workout_total
    )
    return DayOut(
        date=on,
        today=today,
        entries=entries,
        totals={key: totals.get(key) for key in KEYS},
        goal_calories=goal.calories if goal else None,
        remaining_calories=goal.calories - eaten if goal else None,
        workouts=done,
        burned=burned,
        balance_calories=eaten - burned.total,
    )


def remove_entry(session: Session, user: User, entry_id: uuid.UUID) -> bool:
    entry = _find_entry(session, user, entry_id)
    if entry is None:
        return False
    session.delete(entry)
    session.commit()
    return True


def _find_entry(session: Session, user: User, entry_id: uuid.UUID) -> LogEntry | None:
    return session.scalar(
        select(LogEntry).where(LogEntry.id == entry_id, LogEntry.user_id == user.id)
    )


def change_entry(
    session: Session, user: User, entry_id: uuid.UUID, data: LogEntryPatch
) -> LogEntry | None:
    """Give an entry a new amount. Returns None if it is not this person's entry.

    A typed amount is turned into grams with the food's own servings, so "2 bars" works; if that
    is not possible the usual amount error (422 with a code) is raised and nothing changes.
    """
    entry = _find_entry(session, user, entry_id)
    if entry is None:
        return None
    text = (data.amount_text or "").strip() or None
    grams = data.grams
    if grams is None:
        if text is None:
            raise InvalidInputError(
                [Problem("amount_text", "Type an amount, like 2 bars or 150 g.")]
            )
        food = entry.food
        grams = round(
            grams_for_text(text, food.name, [(s.label, s.grams) for s in food.servings])[0], 2
        )
    if grams > settings.food.max_serving_grams:
        raise InvalidInputError([Problem("grams", "That is more food than one entry can hold.")])
    entry.grams = grams
    entry.amount_text = text
    session.commit()
    session.refresh(entry)
    return entry


def _summaries(
    session: Session, user: User, start: date, end: date
) -> tuple[list[WeekDayOut], int | None, float | None]:
    """One line per day from `start` to `end`, the calorie target, and the average over the
    days that have anything logged."""
    statement = select(LogEntry).where(
        LogEntry.user_id == user.id, LogEntry.logged_on >= start, LogEntry.logged_on <= end
    )
    per_day: dict[date, list[LogEntryOut]] = {}
    for entry in session.scalars(statement):
        per_day.setdefault(entry.logged_on, []).append(entry_out(entry))
    days = []
    for offset in range((end - start).days + 1):
        on = start + timedelta(days=offset)
        items = per_day.get(on, [])
        totals = sum_nutrients(item.nutrients for item in items)
        days.append(
            WeekDayOut(
                date=on,
                calories=totals.get("calories") or 0.0,
                protein_g=totals.get("protein_g") or 0.0,
                entries=len(items),
            )
        )
    logged = [d.calories for d in days if d.entries]
    goal = profiles.get_current_goal(session, user)
    return days, goal.calories if goal else None, sum(logged) / len(logged) if logged else None


def week(session: Session, user: User, end: date) -> WeekOut:
    """Calories and protein for the seven days ending on `end`."""
    days, goal, average = _summaries(session, user, end - timedelta(days=6), end)
    return WeekOut(end=end, days=days, goal_calories=goal, average_calories=average)


def month(session: Session, user: User, year: int, number: int, today: date) -> MonthOut:
    """Every day of one calendar month."""
    first = date(year, number, 1)
    last = (date(year + number // 12, number % 12 + 1, 1)) - timedelta(days=1)
    days, goal, average = _summaries(session, user, first, last)
    return MonthOut(
        month=f"{year:04d}-{number:02d}",
        today=today,
        days=days,
        goal_calories=goal,
        average_calories=average,
    )
