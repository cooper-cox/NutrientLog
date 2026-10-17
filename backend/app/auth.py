"""Who is calling: anonymous-user tokens, and the "current user" dependency for routes.

Each device gets a long random token when its user is created. The server keeps only a hash of
it (like a password), so a leaked database does not leak working tokens.
"""

import hashlib
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import User, UserSettings

_bearer = HTTPBearer(auto_error=False)


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_anonymous_user(session: Session) -> tuple[User, str]:
    """Create a new anonymous user. Returns the user and their token (the only time it is known)."""
    token = generate_token()
    user = User(token_hash=hash_token(token), settings=UserSettings(unit_preference="metric"))
    session.add(user)
    session.flush()
    session.commit()
    return user, token


def authenticate(session: Session, token: str) -> User | None:
    """Find the user who owns this token, or None."""
    return session.scalar(select(User).where(User.token_hash == hash_token(token)))


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    """The user who owns the "Authorization: Bearer <token>" header, or a 401 error."""
    unauthorized = HTTPException(
        status_code=401,
        detail="missing or invalid token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    user = authenticate(session, credentials.credentials)
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
