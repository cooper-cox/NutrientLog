"""Date and timezone helpers. All "what day is it for this user?" questions go through here.

Functions take the current time as an argument instead of reading the clock, so they are
deterministic and easy to test.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def is_valid_timezone(name: str) -> bool:
    """True if `name` is a real timezone such as "America/Los_Angeles"."""
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        return False
    return True


def local_today(timezone: str, now: datetime) -> date:
    """The calendar date it is right now for a user in `timezone`.

    `now` must be timezone-aware (for example `datetime.now(UTC)`).
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    return now.astimezone(ZoneInfo(timezone)).date()


def age_on(birth_date: date, on_date: date) -> int:
    """Whole years of age on `on_date`. Feb 29 birthdays count from Mar 1 in non-leap years."""
    had_birthday = (on_date.month, on_date.day) >= (birth_date.month, birth_date.day)
    return on_date.year - birth_date.year - (0 if had_birthday else 1)
