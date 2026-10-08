from sqlalchemy import text
from sqlalchemy.orm import Session


def ping(session: Session) -> None:
    """Run the cheapest possible query. Raises if the database is unreachable."""
    session.execute(text("SELECT 1"))
