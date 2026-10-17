"""Tests for settings: the real config.toml loads, every value is sensible, typos are caught."""

import pytest
from pydantic import ValidationError

from app.settings import Settings, load_config

DB = "postgresql+psycopg://u:p@localhost:5432/x"


def test_the_real_config_file_loads_and_every_value_is_in_range() -> None:
    settings = Settings(database_url=DB, **load_config())  # type: ignore[arg-type]
    assert settings.search.source_limit >= 1
    assert settings.goals.calorie_floor.female < settings.goals.calorie_floor.male
    assert settings.goals.max_gain_kg_per_week <= settings.goals.max_lose_kg_per_week


def test_the_values_are_the_ones_the_app_always_used() -> None:
    config = Settings(database_url=DB, **load_config())  # type: ignore[arg-type]
    assert config.ranking.coverage == 100.0
    assert config.ranking.exact_name == 20.0
    assert config.search.usda_generic_limit == 60
    assert config.search.usda_retry_waits == (1.0, 3.0)
    assert config.search.off_retry_waits == (2.0, 5.0)
    assert config.goals.activity.light == 1.375
    assert config.goals.calorie_floor.no_answer == 1350
    assert config.profile.max_goal_bmi == 45.0


def test_a_misspelt_setting_name_is_an_error_not_ignored() -> None:
    config = load_config()
    config["search"] = {**config["search"], "saved_limitt": 5}  # type: ignore[dict-item]
    with pytest.raises(ValidationError):
        Settings(database_url=DB, **config)  # type: ignore[arg-type]


def test_an_absurd_value_is_rejected() -> None:
    config = load_config()
    config["goals"] = {**config["goals"], "max_lose_kg_per_week": 5.0}  # type: ignore[dict-item]
    with pytest.raises(ValidationError):
        Settings(database_url=DB, **config)  # type: ignore[arg-type]


def test_the_database_address_has_no_built_in_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValidationError):
        Settings(**load_config())  # type: ignore[arg-type]
