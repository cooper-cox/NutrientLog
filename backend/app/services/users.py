from sqlalchemy.orm import Session

from app.core import security
from app.models import User
from app.repositories import users as users_repo


def create_anonymous_user(session: Session) -> tuple[User, str]:
    """Create a new anonymous user. Returns the user and their token (the only time it is known)."""
    token = security.generate_token()
    user = users_repo.create(session, security.hash_token(token))
    session.commit()
    return user, token


def authenticate(session: Session, token: str) -> User | None:
    """Find the user who owns this token, or None."""
    return users_repo.get_by_token_hash(session, security.hash_token(token))
