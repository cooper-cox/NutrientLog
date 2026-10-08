from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.core.db import get_session
from app.main import app


class _BrokenSession:
    """Stands in for a session whose database is down."""

    def execute(self, *args: Any, **kwargs: Any) -> None:
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_health_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_db_returns_503_when_database_is_down(client: TestClient) -> None:
    app.dependency_overrides[get_session] = lambda: _BrokenSession()
    response = client.get("/health/db")
    assert response.status_code == 503
    assert response.json() == {"detail": "database unreachable"}
