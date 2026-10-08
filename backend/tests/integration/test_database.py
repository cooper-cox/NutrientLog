"""Integration tests: need a real Postgres (DATABASE_URL) with migrations applied.

Locally:  docker compose up -d db && alembic upgrade head && pytest tests/integration
In CI:    the workflow starts a Postgres service and runs the migrations first.
"""

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.db import get_engine
from app.main import app


def test_health_db_reachable() -> None:
    with TestClient(app) as client:
        response = client.get("/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "reachable"}


def test_migration_created_users_table() -> None:
    with get_engine().connect() as connection:
        table = connection.execute(text("SELECT to_regclass('public.users')")).scalar()
    assert table == "users"
