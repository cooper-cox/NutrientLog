from sqlalchemy.orm import Session

from app.models import Goal, User
from app.repositories import goals as goals_repo


def get_current_goal(session: Session, user: User) -> Goal | None:
    return goals_repo.get_current(session, user.id)
