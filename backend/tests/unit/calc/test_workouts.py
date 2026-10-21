import pytest

from app.calc.workouts import workout_calories
from app.settings import settings


def test_calories_are_the_met_above_rest_times_weight_and_hours() -> None:
    # Walking (3.5 MET) for an hour at 80 kg: 2.5 x 80 x 1 = 200.
    assert workout_calories(3.5, 80, 60, 1.0) == pytest.approx(200)
    assert workout_calories(3.5, 80, 30, 1.0) == pytest.approx(100)


def test_intensity_scales_the_result() -> None:
    assert workout_calories(8.0, 80, 60, 1.25) == pytest.approx(7 * 80 * 1.25)
    assert workout_calories(8.0, 80, 60, 0.8) < workout_calories(8.0, 80, 60, 1.0)


def test_heavier_people_burn_more() -> None:
    assert workout_calories(6, 100, 45, 1.0) > workout_calories(6, 60, 45, 1.0)


@pytest.mark.parametrize(
    ("met", "weight", "minutes", "factor"),
    [(1.0, 80, 30, 1.0), (0.5, 80, 30, 1.0), (5, 0, 30, 1.0), (5, 80, 0, 1.0), (5, 80, 30, 0)],
)
def test_nonsense_inputs_are_refused(
    met: float, weight: float, minutes: float, factor: float
) -> None:
    with pytest.raises(ValueError):
        workout_calories(met, weight, minutes, factor)


def test_the_configured_activities_are_sensible() -> None:
    keys = [a.key for a in settings.workouts.activities]
    assert len(keys) == len(set(keys)) and "walking" in keys and "other" in keys
    met = {a.key: a.met for a in settings.workouts.activities}
    assert met["walking"] < met["cycling"] < met["running"]
    assert settings.workouts.intensity_light < settings.workouts.intensity_moderate
    assert settings.workouts.intensity_moderate < settings.workouts.intensity_hard
