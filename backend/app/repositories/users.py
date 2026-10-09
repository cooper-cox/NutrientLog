from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User, UserSettings


def create(session: Session, token_hash: str) -> User:
    user = User(token_hash=token_hash, settings=UserSettings(unit_preference="metric"))
    session.add(user)
    session.flush()
    return user


def get_by_token_hash(session: Session, token_hash: str) -> User | None:
    return session.scalar(select(User).where(User.token_hash == token_hash))
