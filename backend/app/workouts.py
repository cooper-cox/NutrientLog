"""Workouts: logging one, removing it, and adding up what a day burned.

Like the food log, every question is scoped to the signed-in user. A workout's calories are
estimated from the person's weight at the last profile save, unless they typed the calories in.
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calc.goals import InvalidInputError, Problem
from app.calc.workouts import workout_calories
from app.models import User, Workout
from app.schemas import ActivitiesOut, ActivityOut, WorkoutIn, WorkoutOut
from app.settings import settings

INTENSITIES = ("light", "moderate", "hard")


def _label(key: str) -> str:
    return next((a.label for a in settings.workouts.activities if a.key == key), key)


def activities_out() -> ActivitiesOut:
    config = settings.workouts
    return ActivitiesOut(
        activities=[ActivityOut(key=a.key, label=a.label) for a in config.activities],
        intensities=list(INTENSITIES),
        max_minutes=config.max_minutes,
    )


def workout_out(workout: Workout) -> WorkoutOut:
    return WorkoutOut(
        id=workout.id,
        logged_on=workout.logged_on,
        activity=workout.activity,
        label=_label(workout.activity),
        minutes=workout.minutes,
        intensity=workout.intensity,
        calories=workout.calories,
        calories_typed=workout.calories_typed,
    )


def _factor(intensity: str) -> float:
    config = settings.workouts
    return {
        "light": config.intensity_light,
        "moderate": config.intensity_moderate,
        "hard": config.intensity_hard,
    }[intensity]


def add_workout(session: Session, user: User, data: WorkoutIn, today: date) -> Workout:
    config = settings.workouts
    problems: list[Problem] = []
    activity = next((a for a in config.activities if a.key == data.activity), None)
    if activity is None:
        problems.append(Problem("activity", "Pick an activity from the list."))
    if data.minutes > config.max_minutes:
        problems.append(
            Problem("minutes", f"A workout can be at most {config.max_minutes} minutes.")
        )
    if data.calories is not None and data.calories > config.max_calories:
        problems.append(
            Problem("calories", f"That is more than {config.max_calories:.0f} calories.")
        )
    logged_on = data.logged_on or today
    if abs((logged_on - today).days) > 366:
        problems.append(Problem("logged_on", "That date is too far from today."))
    if data.calories is None and not user.weight_kg and activity is not None:
        problems.append(
            Problem("calories", "Finish your profile so calories can be estimated, or type them.")
        )
    if problems:
        raise InvalidInputError(problems)
    assert activity is not None  # for the type checker; problems above cover None
    if data.calories is not None:
        calories, typed = data.calories, True
    else:
        weight = user.weight_kg or 0.0
        calories = workout_calories(activity.met, weight, data.minutes, _factor(data.intensity))
        typed = False
    workout = Workout(
        id=uuid.uuid4(),
        user_id=user.id,
        logged_on=logged_on,
        activity=activity.key,
        minutes=data.minutes,
        intensity=data.intensity,
        calories=round(calories, 1),
        calories_typed=typed,
    )
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return workout


def remove_workout(session: Session, user: User, workout_id: uuid.UUID) -> bool:
    workout = session.scalar(
        select(Workout).where(Workout.id == workout_id, Workout.user_id == user.id)
    )
    if workout is None:
        return False
    session.delete(workout)
    session.commit()
    return True


def for_day(session: Session, user: User, on: date) -> list[Workout]:
    statement = (
        select(Workout)
        .where(Workout.user_id == user.id, Workout.logged_on == on)
        .order_by(Workout.created_at, Workout.id)
    )
    return list(session.scalars(statement))


def short_names_by_day(
    session: Session, user: User, start: date, end: date
) -> dict[date, list[str]]:
    """The short names of the workouts done on each day from `start` to `end`, in the order done."""
    short = {a.key: a.short for a in settings.workouts.activities}
    statement = (
        select(Workout)
        .where(Workout.user_id == user.id, Workout.logged_on >= start, Workout.logged_on <= end)
        .order_by(Workout.created_at, Workout.id)
    )
    found: dict[date, list[str]] = {}
    for workout in session.scalars(statement):
        found.setdefault(workout.logged_on, []).append(short.get(workout.activity, "Other"))
    return found
