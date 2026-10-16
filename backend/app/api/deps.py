"""Shared route dependencies."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_session
from app.integrations.base import FoodSource
from app.integrations.openfoodfacts import OpenFoodFactsClient
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


@lru_cache
def _off_client() -> OpenFoodFactsClient:
    return OpenFoodFactsClient(country=settings.open_food_facts_country)


def get_food_sources() -> list[FoodSource]:
    """The outside food databases that are switched on (USDA needs a key; the other does not)."""
    sources: list[FoodSource] = []
    if settings.usda_api_key:
        sources.append(_usda_client(settings.usda_api_key))
    if settings.open_food_facts:
        sources.append(_off_client())
    return sources
