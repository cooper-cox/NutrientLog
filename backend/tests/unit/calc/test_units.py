import pytest

from app.calc import units


@pytest.mark.parametrize(
    ("kg", "lb"),
    [(0, 0), (1, 2.2046226), (45.359237, 100), (80, 176.3698)],
)
def test_kg_lb_known_values(kg: float, lb: float) -> None:
    assert units.kg_to_lb(kg) == pytest.approx(lb, abs=1e-3)
    assert units.lb_to_kg(lb) == pytest.approx(kg, abs=1e-3)


@pytest.mark.parametrize("value", [0.0, 1.0, 72.5, 250.0])
def test_round_trips_return_the_original_value(value: float) -> None:
    assert units.lb_to_kg(units.kg_to_lb(value)) == pytest.approx(value)
    assert units.inches_to_cm(units.cm_to_inches(value)) == pytest.approx(value)
    assert units.oz_to_g(units.g_to_oz(value)) == pytest.approx(value)


def test_inches_and_cm() -> None:
    assert units.inches_to_cm(1) == pytest.approx(2.54)
    assert units.cm_to_inches(2.54) == pytest.approx(1)


def test_feet_inches_to_cm() -> None:
    assert units.feet_inches_to_cm(6, 0) == pytest.approx(182.88)
    assert units.feet_inches_to_cm(5, 10) == pytest.approx(177.8)
    assert units.feet_inches_to_cm(5) == pytest.approx(152.4)


@pytest.mark.parametrize(
    ("cm", "expected"),
    [
        (182.88, (6, 0.0)),
        (177.8, (5, 10.0)),
        (152.4, (5, 0.0)),
        (170.0, (5, 6.9)),
    ],
)
def test_cm_to_feet_inches(cm: float, expected: tuple[int, float]) -> None:
    assert units.cm_to_feet_inches(cm) == expected


def test_cm_to_feet_inches_carries_when_inches_round_up_to_a_full_foot() -> None:
    # 71.96 in is 5 ft 11.96 in, which rounds to 5 ft 12.0 in. That must become 6 ft 0 in.
    assert units.cm_to_feet_inches(71.96 * 2.54) == (6, 0.0)


def test_grams_and_ounces() -> None:
    assert units.g_to_oz(28.349523125) == pytest.approx(1)
    assert units.oz_to_g(1) == pytest.approx(28.349523125)
    assert units.oz_to_g(4) == pytest.approx(113.398, abs=1e-3)
