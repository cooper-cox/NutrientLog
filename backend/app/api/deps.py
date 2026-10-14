"""Shared route dependencies."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_session
from app.integrations.base import FoodSource
from app.integrations.usda import UsdaClient
from app.models import User
from app.services import users as users_service

_bearer = HTTPBearer(auto_error=False)


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
    user = users_service.authenticate(session, credentials.credentials)
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@lru_cache
def _usda_client(api_key: str) -> UsdaClient:
    return UsdaClient(api_key)


def get_food_source() -> FoodSource | None:
    """The outside food database, or None when no USDA key is set (the lookup is then off)."""
    if not settings.usda_api_key:
        return None
    return _usda_client(settings.usda_api_key)
