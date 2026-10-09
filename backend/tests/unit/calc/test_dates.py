from datetime import UTC, date, datetime

import pytest

from app.calc.dates import age_on, is_valid_timezone, local_today


@pytest.mark.parametrize(
    ("birth_date", "on_date", "expected"),
    [
        (date(2000, 1, 15), date(2025, 1, 14), 24),  # day before the birthday
        (date(2000, 1, 15), date(2025, 1, 15), 25),  # on the birthday
        (date(2000, 1, 15), date(2025, 12, 31), 25),  # later in the year
        (date(2000, 2, 29), date(2025, 2, 28), 24),  # leap-day birthday, non-leap year
        (date(2000, 2, 29), date(2025, 3, 1), 25),
        (date(2000, 2, 29), date(2024, 2, 29), 24),  # leap year, on the birthday
    ],
)
def test_age_on(birth_date: date, on_date: date, expected: int) -> None:
    assert age_on(birth_date, on_date) == expected


def test_local_today_follows_the_users_timezone() -> None:
    # 03:00 UTC on Oct 9 is still the evening of Oct 8 in Los Angeles (PDT, UTC-7).
    now = datetime(2026, 10, 9, 3, 0, tzinfo=UTC)
    assert local_today("UTC", now) == date(2026, 10, 9)
    assert local_today("America/Los_Angeles", now) == date(2026, 10, 8)
    assert local_today("Pacific/Auckland", now) == date(2026, 10, 9)


def test_local_today_handles_standard_time() -> None:
    # 07:30 UTC on Jan 1 is 23:30 on Dec 31 in Los Angeles (PST, UTC-8).
    now = datetime(2026, 1, 1, 7, 30, tzinfo=UTC)
    assert local_today("America/Los_Angeles", now) == date(2025, 12, 31)


def test_local_today_rejects_a_naive_time() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        local_today("UTC", datetime(2026, 10, 9, 3, 0))


@pytest.mark.parametrize("name", ["UTC", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"])
def test_real_timezones_are_valid(name: str) -> None:
    assert is_valid_timezone(name)


@pytest.mark.parametrize("name", ["", "Not/AZone", "pacific time", "../etc/passwd"])
def test_made_up_timezones_are_invalid(name: str) -> None:
    assert not is_valid_timezone(name)
