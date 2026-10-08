from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.repositories import health as health_repo


def database_is_reachable(session: Session) -> bool:
    try:
        health_repo.ping(session)
    except SQLAlchemyError:
        return False
    return True
