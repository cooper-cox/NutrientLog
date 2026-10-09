from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.clock import utc_now
from app.core.db import get_engine, get_session
from app.main import app

# The pretend "current time" for API tests: noon UTC on Oct 8, 2026.
FIXED_NOW = datetime(2026, 10, 8, 12, 0, tzinfo=UTC)


@pytest.fixture
def db_session() -> Iterator[Session]:
    """A database session whose changes are all undone when the test ends.

    The service layer calls commit(); with "create_savepoint" that only commits a savepoint
    inside the outer transaction, which is rolled back at the end. Tests therefore never leave
    data behind in the database you use for development.
    """
    connection = get_engine().connect()
    outer_transaction = connection.begin()
    session = Session(
        bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
    )
    try:
        yield session
    finally:
        session.close()
        outer_transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[utc_now] = lambda: FIXED_NOW
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def token(client: TestClient) -> str:
    """A freshly created user's token."""
    response = client.post("/api/v1/users")
    assert response.status_code == 201
    return str(response.json()["token"])


@pytest.fixture
def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
