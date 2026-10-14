import uuid

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Food


def add(session: Session, food: Food) -> Food:
    session.add(food)
    session.flush()
    return food


def get_for_user(session: Session, user_id: uuid.UUID, food_id: uuid.UUID) -> Food | None:
    """A food this user may see: their own, or a shared one (no owner)."""
    statement = select(Food).where(
        Food.id == food_id, (Food.owner_user_id == user_id) | Food.owner_user_id.is_(None)
    )
    return session.scalar(statement)


def find_by_source(
    session: Session, user_id: uuid.UUID, source: str, source_id: str
) -> Food | None:
    statement = select(Food).where(
        Food.owner_user_id == user_id, Food.source == source, Food.source_id == source_id
    )
    return session.scalars(statement).first()


def saved_source_ids(session: Session, user_id: uuid.UUID, source: str) -> set[str]:
    statement = select(Food.source_id).where(
        Food.owner_user_id == user_id, Food.source == source, Food.source_id.is_not(None)
    )
    return {value for value in session.scalars(statement) if value is not None}


def _escape_like(word: str) -> str:
    return word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search(session: Session, user_id: uuid.UUID, words: list[str], limit: int) -> list[Food]:
    """Foods the user can see whose name or brand contains every word (any case).

    Foods whose name starts with the first word come first, then alphabetical.
    """
    text = func.concat_ws(" ", Food.name, Food.brand)
    statement = select(Food).where((Food.owner_user_id == user_id) | Food.owner_user_id.is_(None))
    for word in words:
        statement = statement.where(text.ilike(f"%{_escape_like(word)}%", escape="\\"))
    starts_with = case((Food.name.ilike(f"{_escape_like(words[0])}%", escape="\\"), 0), else_=1)
    statement = statement.order_by(starts_with, func.lower(Food.name), Food.id).limit(limit)
    return list(session.scalars(statement))
