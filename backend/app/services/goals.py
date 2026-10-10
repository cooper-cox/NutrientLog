from sqlalchemy.orm import Session

from app.calc.goals import weeks_to_goal
from app.models import Goal, User
from app.repositories import goals as goals_repo
from app.schemas.profile import GoalOut


def get_current_goal(session: Session, user: User) -> Goal | None:
    return goals_repo.get_current(session, user.id)


def goal_out(goal: Goal, user: User) -> GoalOut:
    """The goal as the API returns it, with the time-to-goal estimate worked out."""
    weeks = None
    if user.weight_kg is not None:
        weeks = weeks_to_goal(user.weight_kg, user.goal_weight_kg, goal.rate_kg_per_week)
    return GoalOut.model_validate(goal).model_copy(update={"weeks_to_goal": weeks})
