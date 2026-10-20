"""Tests for the choices offered for "how much?" (own servings, rough sizes, exact units)."""

import pytest

from app.calc.measures import AmountError, UnknownDensity
from app.calc.portions import Portion, grams_for_text, portion_options

YOGURT = [("1 container (170 g)", 170.0), ("1 cup (245 g)", 245.0)]
CUP = 245.0


def _by_label(options: list[Portion]) -> dict[str, Portion]:
    return {o.label: o for o in options}


def test_a_food_with_a_cup_serving_gets_bowls_plates_and_exact_units() -> None:
    options = _by_label(portion_options("Yogurt, Greek, plain", YOGURT))
    assert options["container"].kind == "own"
    assert options["container"].grams == 170.0
    for label in ("small bowl", "medium bowl", "large bowl", "small plate", "plate", "large plate"):
        assert options[label].kind == "rough"
        assert options[label].note.startswith("about ")
    assert options["cup"].grams == pytest.approx(CUP)
    assert options["g"].grams == 1.0
    assert options["oz"].grams == pytest.approx(28.3495, abs=1e-3)


def test_bowls_are_sized_from_the_weight_of_a_cup_and_get_bigger() -> None:
    options = _by_label(portion_options("Yogurt, Greek, plain", YOGURT))
    small, medium, large = (options[n].grams for n in ("small bowl", "medium bowl", "large bowl"))
    assert 0 < small < medium < large
    assert medium == pytest.approx(CUP * 1.0)  # config: medium bowl = 1 cup


def test_a_small_bowl_note_says_roughly_how_much_it_is() -> None:
    options = _by_label(portion_options("Yogurt, Greek, plain", YOGURT))
    assert options["small bowl"].note.startswith("about 4.3 oz (12")


def test_without_a_known_cup_there_are_no_bowls_only_small_and_large_portions() -> None:
    options = _by_label(portion_options("Clif Bar", [("1 bar (68 g)", 68.0)]))
    assert "small bowl" not in options and "cup" not in options and "ml" not in options
    assert options["small portion"].grams == pytest.approx(34.0)
    assert options["large portion"].grams == pytest.approx(102.0)
    assert options["bar"].kind == "own"
    assert options["g"].kind == "exact"


def test_nothing_rough_is_invented_for_a_food_with_no_servings_at_all() -> None:
    options = portion_options("Mystery food", [])
    assert [o.label for o in options] == ["g", "oz"]


def test_a_plain_food_known_by_name_gets_cups_without_a_serving() -> None:
    options = _by_label(portion_options("Milk, whole", []))
    assert options["cup"].grams == pytest.approx(1.03 * 236.5882365, abs=0.01)
    assert "medium bowl" in options


def test_every_label_appears_once_and_the_foods_own_serving_wins() -> None:
    options = portion_options("Flour", [("1 cup (125 g)", 125.0), ("1 plate (300 g)", 300.0)])
    labels = [o.label for o in options]
    assert len(labels) == len(set(labels))
    assert {o.label: o for o in options}["plate"].kind == "own"


def test_quantities_include_the_fractions_people_say_aloud() -> None:
    quantities = portion_options("Yogurt, Greek, plain", YOGURT)[0].quantities
    for wanted in (0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 2):
        assert any(abs(q - wanted) < 1e-9 for q in quantities)
    assert list(quantities) == sorted(quantities)


def test_exact_units_have_their_own_quantity_steps() -> None:
    options = _by_label(portion_options("Yogurt, Greek, plain", YOGURT))
    assert 5.0 in options["g"].quantities and 250.0 in options["g"].quantities
    assert 8.0 in options["oz"].quantities


@pytest.mark.parametrize(
    ("text", "grams"),
    [
        ("1 small bowl", CUP * 0.5),
        ("2 medium bowls", CUP * 2.0),
        ("1/2 large bowl", CUP * 1.75 / 2),
        ("1/4 container", 170 / 4),
        ("1/4 of a container", 170 / 4),
        ("1 cup", CUP),
        ("100 g", 100.0),
    ],
)
def test_typed_rough_amounts_work_the_same_as_the_wheel(text: str, grams: float) -> None:
    assert grams_for_text(text, "Yogurt, Greek, plain", YOGURT)[0] == pytest.approx(grams)


def test_a_rough_size_that_needs_a_cup_is_refused_when_the_cup_is_unknown() -> None:
    with pytest.raises(AmountError):
        grams_for_text("1 small bowl", "Clif Bar", [("1 bar (68 g)", 68.0)])
    with pytest.raises(UnknownDensity):
        grams_for_text("1 cup", "Clif Bar", [("1 bar (68 g)", 68.0)])


def test_bowls_are_offered_for_bowl_foods_known_by_name_even_without_a_cup_serving() -> None:
    options = _by_label(portion_options("CHOBANI, Whole Milk Plain Greek Yogurt", []))
    assert {"small bowl", "medium bowl", "large bowl"} <= set(options)
    # The name-based guess sizes bowls only; it never invents a "cup" unit.
    assert "cup" not in options and "ml" not in options
    assert options["medium bowl"].grams == pytest.approx(1.04 * 236.5882365, abs=0.1)


def test_a_food_with_a_container_but_no_cup_still_gets_bowls_if_it_is_a_bowl_food() -> None:
    options = _by_label(portion_options("Yogurt, Greek, lowfat", [("1 container (170 g)", 170)]))
    assert options["container"].grams == 170 and "small bowl" in options
    assert "small portion" not in options


def test_a_packaged_bar_gets_no_bowls() -> None:
    options = _by_label(portion_options("Clif Bar", [("1 bar (68 g)", 68)]))
    assert "small bowl" not in options and "small portion" in options
