import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Goal


def add(session: Session, goal: Goal) -> Goal:
    session.add(goal)
    session.flush()
    return goal


def get_current(session: Session, user_id: uuid.UUID) -> Goal | None:
    """The goal in effect now: the newest one (latest start date, then latest saved)."""
    statement = (
        select(Goal)
        .where(Goal.user_id == user_id)
        .order_by(Goal.effective_from.desc(), Goal.id.desc())
        .limit(1)
    )
    return session.scalar(statement)
