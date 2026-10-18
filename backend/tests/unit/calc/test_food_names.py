import pytest

from app.calc.food_names import brand_key, drop_repeated_flavor, short_brand


@pytest.mark.parametrize(
    ("brand", "short"),
    [
        ("Clif Bar And Company", "Clif Bar"),
        ("Red Bull North America, Inc.", "Red Bull"),
        ("Clif", "Clif"),
        ("Kind LLC", "Kind"),
        ("General Mills Sales Inc.", "General Mills Sales"),
        ("Company", "Company"),  # never reduced to nothing
        ("  Great   Value ", "Great Value"),
    ],
)
def test_short_brand(brand: str, short: str) -> None:
    assert short_brand(brand) == short


@pytest.mark.parametrize(
    ("name", "tidy"),
    [
        (
            "Dark Chocolate Nuts & Sea Salt Bars, Dark Chocolate Nuts & Sea Salt",
            "Dark Chocolate Nuts & Sea Salt Bars",
        ),
        ("Nut Butter Bar, Peanut Butter", "Nut Butter Bar, Peanut Butter"),  # a real flavour
        ("Cookie Dough Protein Bar", "Cookie Dough Protein Bar"),
        ("Bar, ", "Bar,"),
    ],
)
def test_a_flavour_that_only_repeats_the_name_is_dropped(name: str, tidy: str) -> None:
    assert drop_repeated_flavor(name) == tidy


def test_brand_key_is_the_first_word_of_the_short_brand() -> None:
    assert brand_key("Clif Bar And Company") == brand_key("Clif") == "clif"
    assert brand_key(None) is None and brand_key("") is None
