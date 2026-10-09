from datetime import UTC, datetime


def utc_now() -> datetime:
    """The current time. Used as a FastAPI dependency so tests can replace it with a fixed time."""
    return datetime.now(UTC)
