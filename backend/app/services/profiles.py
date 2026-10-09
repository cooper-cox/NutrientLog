from datetime import datetime

from sqlalchemy.orm import Session

from app.calc import dates
from app.calc.calorie_target import calculate_calorie_target
from app.calc.macros import calculate_macro_targets
from app.models import Goal, User
from app.repositories import goals as goals_repo
from app.schemas.profile import ProfileIn, ProfileOut, UnitPreference


class InvalidProfileError(Exception):
    """The survey answers can't be turned into a safe target (e.g. under 18, absurd weight)."""


def save_profile(session: Session, user: User, data: ProfileIn, now: datetime) -> Goal:
    """Save the survey answers and calculate a new goal from them.

    "Today" is the user's local date, so the goal's start date and the user's age are correct
    even when it is already tomorrow (or still yesterday) in UTC.
    """
    today = dates.local_today(data.timezone, now)

    try:
        target = calculate_calorie_target(
            sex=data.sex,
            age_years=dates.age_on(data.birth_date, today),
            height_cm=data.height_cm,
            weight_kg=data.weight_kg,
            activity=data.activity_level,
            goal=data.goal_type,
            rate_kg_per_week=data.rate_kg_per_week,
        )
    except ValueError as error:
        raise InvalidProfileError(str(error)) from error
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

    goal = goals_repo.add(
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
