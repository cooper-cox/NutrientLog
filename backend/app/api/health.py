"""Infrastructure health checks (unversioned: Docker and CI expect fixed URLs)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.schemas.health import DatabaseHealthResponse, HealthResponse
from app.services import health as health_service

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Is the API process up? Does not touch the database."""
    return HealthResponse(status="ok")


@router.get("/health/db", response_model=DatabaseHealthResponse)
def health_db(session: Annotated[Session, Depends(get_session)]) -> DatabaseHealthResponse:
    """Can the API reach the database?"""
    if not health_service.database_is_reachable(session):
        raise HTTPException(status_code=503, detail="database unreachable")
    return DatabaseHealthResponse(status="ok", database="reachable")
