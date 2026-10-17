"""The person's profile and calorie goal: saving the survey, working out the goal, reading both."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calc import dates
from app.calc.goals import (
    InvalidInputError,
    calculate_calorie_target,
    calculate_macro_targets,
    weeks_to_goal,
)
from app.calc.profile_check import check_profile
from app.models import Goal, User
from app.schemas import GoalOut, ProfileIn, ProfileOut, UnitPreference


def _save_goal(session: Session, goal: Goal) -> Goal:
    session.add(goal)
    session.flush()
    return goal


def _newest_goal(session: Session, user_id: uuid.UUID) -> Goal | None:
    """The goal in effect now: the newest one (latest start date, then latest saved)."""
    statement = (
        select(Goal)
        .where(Goal.user_id == user_id)
        .order_by(Goal.effective_from.desc(), Goal.id.desc())
        .limit(1)
    )
    return session.scalar(statement)


def save_profile(session: Session, user: User, data: ProfileIn, now: datetime) -> Goal:
    """Save the survey answers and calculate a new goal from them.

    "Today" is the user's local date, so the goal's start date and the user's age are correct
    even when it is already tomorrow (or still yesterday) in UTC.
    """
    today = dates.local_today(data.timezone, now)

    age_years = dates.age_on(data.birth_date, today)
    # Every problem is collected first, so the person can fix all of them in one go.
    problems = check_profile(
        age_years=age_years,
        height_cm=data.height_cm,
        weight_kg=data.weight_kg,
        goal_weight_kg=data.goal_weight_kg,
        goal=data.goal_type,
        rate_kg_per_week=data.rate_kg_per_week,
        units=data.unit_preference.value,
    )
    if problems:
        raise InvalidInputError(problems)

    target = calculate_calorie_target(
        sex=data.sex,
        age_years=age_years,
        height_cm=data.height_cm,
        weight_kg=data.weight_kg,
        activity=data.activity_level,
        goal=data.goal_type,
        rate_kg_per_week=data.rate_kg_per_week,
    )
    macros = calculate_macro_targets(target.calories, data.weight_kg)

    user.name = data.name
    user.sex = data.sex.value
    user.birth_date = data.birth_date
    user.height_cm = data.height_cm
    user.weight_kg = data.weight_kg
    user.goal_weight_kg = data.goal_weight_kg
    user.activity_level = data.activity_level.value
    user.goal_type = data.goal_type.value
    user.rate_kg_per_week = data.rate_kg_per_week
    user.timezone = data.timezone
    user.profile_updated_at = now
    user.settings.unit_preference = data.unit_preference.value

    goal = _save_goal(
        session,
        Goal(
            user_id=user.id,
            effective_from=today,
            calories=target.calories,
            protein_g=macros.protein_g,
            fat_g=macros.fat_g,
            carb_g=macros.carb_g,
            weight_kg=data.weight_kg,
            bmr=target.bmr,
            tdee=target.tdee,
            daily_adjustment=target.daily_adjustment,
            rate_kg_per_week=target.rate_kg_per_week,
            rate_was_capped=target.rate_was_capped,
            floor_was_applied=target.floor_was_applied,
        ),
    )
    session.commit()
    return goal


def get_profile(user: User) -> ProfileOut | None:
    """The saved profile, or None if the user hasn't finished onboarding."""
    if user.profile_updated_at is None:
        return None
    return ProfileOut.model_validate(
        {
            "name": user.name,
            "sex": user.sex,
            "birth_date": user.birth_date,
            "height_cm": user.height_cm,
            "weight_kg": user.weight_kg,
            "goal_weight_kg": user.goal_weight_kg,
            "activity_level": user.activity_level,
            "goal_type": user.goal_type,
            "rate_kg_per_week": user.rate_kg_per_week,
            "timezone": user.timezone,
            "unit_preference": UnitPreference(user.settings.unit_preference),
            "updated_at": user.profile_updated_at,
        }
    )


def get_current_goal(session: Session, user: User) -> Goal | None:
    return _newest_goal(session, user.id)


def goal_out(goal: Goal, user: User) -> GoalOut:
    """The goal as the API returns it, with the time-to-goal estimate worked out."""
    weeks = None
    if user.weight_kg is not None:
        weeks = weeks_to_goal(user.weight_kg, user.goal_weight_kg, goal.rate_kg_per_week)
    return GoalOut.model_validate(goal).model_copy(update={"weeks_to_goal": weeks})
