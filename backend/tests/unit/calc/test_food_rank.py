from app.calc.food_rank import Rankable, duplicate_key, full_matches, rank, score, words


def item(name: str, brand: str | None = None, serving: bool = True, position: int = 0) -> Rankable:
    return Rankable(name, brand, serving, position)


def best(query: str, items: list[Rankable]) -> list[str]:
    return [items[index].name for index in rank(query, items)]


def test_words_ignores_case_punctuation_filler_and_simple_plurals() -> None:
    assert words("Bananas, RIPE & the Raw!") == ["banana", "ripe", "raw"]
    assert words("Kit's Bar") == ["kit", "bar"]  # apostrophes vanish, plurals fold
    assert words("glass") == ["glass"]  # "ss" is not a plural
    assert words("") == []


def test_the_brand_and_flavour_beat_a_lookalike_kit() -> None:
    found = best(
        "peanut butter clif bar",
        [
            item("Clif Kit's Organic, Fruit + Nut Bar, Peanut Butter", "Clif Bar", position=0),
            item("Peanut Butter", None, position=1),
            item("Energy Bar, Peanut Butter", "Clif Bar", position=2),
            item("Chocolate Chip Energy Bar", "Clif Bar", position=3),
        ],
    )
    assert found[0] == "Energy Bar, Peanut Butter"
    assert found[-1] in {"Peanut Butter", "Chocolate Chip Energy Bar"}


def test_word_order_does_not_matter() -> None:
    items = [item("Energy Bar, Peanut Butter", "Clif Bar"), item("Oat Bar", "Other")]
    assert best("clif bar peanut butter", items)[0] == "Energy Bar, Peanut Butter"
    assert best("peanut butter clif bar", items)[0] == "Energy Bar, Peanut Butter"


def test_a_plain_food_beats_a_branded_product_for_a_short_query() -> None:
    found = best(
        "banana",
        [
            item("Banana Chips", "Acme", position=0),
            item("Banana Nut Muffin", "Bakery", position=1),
            Rankable("Bananas, ripe, raw", None, True, 2, is_generic=True),
        ],
    )
    assert found[0] == "Bananas, ripe, raw"


def test_the_exact_name_beats_a_longer_one() -> None:
    found = best(
        "all purpose flour",
        [
            item("Pancake Mix with all purpose flour and sugar", "Acme", position=0),
            item("Wheat flour, white, all-purpose", None, position=5),
        ],
    )
    assert found[0] == "Wheat flour, white, all-purpose"


def test_a_brand_word_prefers_that_brand() -> None:
    found = best(
        "clif peanut butter",
        [
            item("Peanut Butter, Creamy", "Jif", position=0),
            item("Peanut Butter Energy Bar", "Clif", position=1),
        ],
    )
    assert found[0] == "Peanut Butter Energy Bar"


def test_matching_more_of_the_words_always_wins() -> None:
    items = [item("Peanut", None, position=0), item("Peanut Butter Cup", "Reese", position=9)]
    assert best("peanut butter cup", items)[0] == "Peanut Butter Cup"


def test_the_sources_own_order_breaks_ties_and_ties_keep_input_order() -> None:
    first = item("Apple", None, position=0)
    later = item("Apple", None, position=20)
    assert score("apple", first) > score("apple", later)
    twin = [item("Apple", None, position=3), item("Apple", None, position=3)]
    assert rank("apple", twin) == [0, 1]


def test_a_serving_is_a_small_bonus_and_an_empty_query_scores_zero() -> None:
    assert score("apple", item("Apple", serving=True)) > score(
        "apple", item("Apple", serving=False)
    )
    assert score("   ", item("Apple")) == 0.0
    assert rank("apple", []) == []


def test_a_result_sharing_no_word_with_the_query_is_left_out() -> None:
    items = [
        item("Mayonnaise", "Lesieur"),
        Rankable("Egg, whole, raw", None, False, 1, is_generic=True),
        item("Egg noodles", "Acme"),
    ]
    assert best("egg", items) == ["Egg, whole, raw", "Egg noodles"]
    assert rank("egg", [item("Mayonnaise")]) == []


def test_the_start_of_a_word_counts_as_a_partial_match_for_half_typed_words() -> None:
    items = [item("Banana bread"), item("Apple pie")]
    assert best("banan", items) == ["Banana bread"]
    assert score("banan", items[0]) < score("banana", items[0])  # a full word is worth more


def test_a_word_one_letter_off_is_still_found_but_short_words_are_not_guessed() -> None:
    assert best("chiken breast", [item("Chicken breast, raw"), item("Beef steak")]) == [
        "Chicken breast, raw"
    ]
    assert rank("cat", [item("Cut")]) == []  # too short to treat as a typo


def test_a_name_starting_with_the_typed_word_beats_one_that_only_contains_it() -> None:
    found = best(
        "oreo",
        [
            item("McFlurry with Oreo cookies", position=0),
            item("Oreo Chocolate Sandwich Cookies", "Nabisco", position=1),
        ],
    )
    assert found[0] == "Oreo Chocolate Sandwich Cookies"


def test_calories_that_disagree_with_the_macros_rank_lower_but_are_not_hidden() -> None:
    sane = Rankable("Olive Oil", "Brand A", True, 1)
    odd = Rankable("Olive Oil", "Brand B", True, 0, energy_mismatch=True)
    assert rank("olive oil", [odd, sane]) == [1, 0]


def test_a_curated_whole_food_wins_even_against_a_community_entry_without_a_brand() -> None:
    community = Rankable("Coca cola", None, False, 0)
    plain = Rankable("Cola, regular", None, False, 5, is_generic=True)
    assert rank("cola", [community, plain])[0] == 1


def test_plain_words_nudge_the_raw_food_ahead_of_a_processed_one() -> None:
    items = [
        Rankable("Chicken breast tenders, breaded", None, False, 0, is_generic=True),
        Rankable("Chicken, breast, raw", None, False, 1, is_generic=True),
    ]
    assert rank("chicken breast", items)[0] == 1


def test_full_matches_counts_candidates_with_every_word() -> None:
    items = [item("Peanut Butter Bar", "Clif"), item("Peanut Butter"), item("Clif Bar", "Clif")]
    assert full_matches("peanut butter clif bar", items) == 1
    assert full_matches("peanut butter", items) == 2


def test_the_same_product_in_different_pack_sizes_has_one_key() -> None:
    a = duplicate_key("JIF 12 OUNCE CREAMY PEANUT BUTTER Each", "Jif", 576.0, 33.0)
    b = duplicate_key("Jif 28 Ounce Creamy Peanut Butter Each", "Jif", 575.8, 33.0)
    assert a == b


def test_real_variants_keep_different_keys() -> None:
    creamy = duplicate_key("Creamy Peanut Butter", "Jif", 576.0, 33.0)
    assert creamy != duplicate_key("Crunchy Peanut Butter", "Jif", 576.0, 33.0)
    assert creamy != duplicate_key("Creamy Peanut Butter", "Skippy", 576.0, 33.0)
    assert creamy != duplicate_key("Creamy Peanut Butter", "Jif", 590.0, 33.0)
    assert creamy != duplicate_key("Creamy Peanut Butter", "Jif", 576.0, None)


def test_the_plain_food_bonus_needs_the_food_to_be_named_for_what_was_typed() -> None:
    named = Rankable("Oreo cookies, plain", None, False, 5, is_generic=True)
    composite = Rankable("McDonald's McFlurry with Oreo cookies", None, False, 5, is_generic=True)
    assert score("oreo", named) > score("oreo", composite) + 10


def test_brand_plus_flavour_does_not_reward_a_name_that_merely_starts_with_a_flavour() -> None:
    items = [
        item("Peanut Butter Banana with Dark Chocolate", "Clif Bar", position=0),
        item("Crunchy Peanut Butter", "Clif Bar", position=1),
    ]
    assert best("peanut butter clif bar", items)[0] == "Crunchy Peanut Butter"


def test_a_typed_plural_that_only_matches_a_singular_ranks_below_the_exact_word() -> None:
    # "snickers" is a product name; "Snicker Doodle" is a different food that merely folds to it.
    results = best(
        "snickers",
        [
            item("Snicker Doodle Cookie", "Sydney's"),
            item("Snickers Minis", "Snickers"),
        ],
    )
    assert results == ["Snickers Minis", "Snicker Doodle Cookie"]
    assert full_matches("snickers", [item("Snicker Doodle Cookie")]) == 0


def test_a_typed_singular_still_finds_a_plural_name_in_full() -> None:
    assert full_matches("banana", [item("Bananas, raw")]) == 1
    assert full_matches("bananas", [item("Banana chips")]) == 0


def test_a_curated_name_that_starts_with_a_category_still_counts_as_named_for_the_food() -> None:
    plain = Rankable("Fish, salmon, Atlantic, wild, raw", None, False, 5, is_generic=True)
    salad = Rankable("Salmon salad", None, False, 0, is_generic=True)
    assert best("salmon", [salad, plain])[0] == "Fish, salmon, Atlantic, wild, raw"
    candy = Rankable("Candies, MARS SNACKFOOD US, SNICKERS Bar", None, False, 9, is_generic=True)
    other = Rankable("Beverages, snack drink, with Snickers flavour", None, False, 0, True)
    assert best("snickers bar", [other, candy])[0].startswith("Candies")


def test_the_category_rule_does_not_reward_a_product_that_only_mentions_the_word() -> None:
    mention = Rankable("McDonald's McFlurry with Oreo", None, False, 0, is_generic=True)
    plain = Rankable("Cookie, oreo", None, False, 5, is_generic=True)
    assert best("oreo", [mention, plain])[0] == "Cookie, oreo"


def test_a_name_that_is_exactly_the_typed_words_beats_dishes_that_contain_them() -> None:
    milk = Rankable("Milk, whole", None, False, 4, is_generic=True)
    yogurt = Rankable("Yogurt, plain, whole milk", None, False, 1, is_generic=True)
    cheese = Rankable("Cheese, mozzarella, whole milk", None, False, 2, is_generic=True)
    assert best("whole milk", [yogurt, cheese, milk])[0] == "Milk, whole"
    ham = Rankable("Ham, honey, smoked, cooked", None, False, 0, is_generic=True)
    honey = Rankable("Honey", None, False, 3, is_generic=True)
    assert best("honey", [ham, honey])[0] == "Honey"


def test_a_brand_that_only_appears_in_a_part_of_a_curated_name_earns_no_bonus() -> None:
    lemonade = Rankable(
        "Beverages, The COCA-COLA company, Minute Maid, Lemonade", None, False, 0, is_generic=True
    )
    cola = Rankable("Coca-Cola, Cola", "Coca-Cola", False, 1)
    assert best("coca cola", [lemonade, cola])[0] == "Coca-Cola, Cola"


def test_a_part_far_down_a_curated_name_is_not_the_item() -> None:
    rhubarb = Rankable("Rhubarb, frozen, raw, with sugar", None, False, 0, is_generic=True)
    sugar = Rankable("Sugar, turbinado, light, dark, dry, sweet", None, False, 5, is_generic=True)
    assert best("sugar", [rhubarb, sugar])[0] == "Sugar, turbinado, light, dark, dry, sweet"


def test_an_exact_name_gets_a_bonus_over_a_slightly_longer_one() -> None:
    plain = Rankable("Honey", None, False, 0, is_generic=True)
    longer = Rankable("Honey, raw", None, False, 0, is_generic=True)
    assert score("honey", plain) > score("honey", longer)


def test_a_packaged_product_does_not_get_the_exact_name_bonus_over_the_plain_food() -> None:
    # "Apple [Treecrisp 2 Go]" has exactly the typed name, but the plain food is what is wanted.
    packaged = Rankable("Apple", "Treecrisp 2 Go", True, 1)
    plain = Rankable("Apples, raw, without skin", None, False, 7, is_generic=True)
    assert best("apple", [packaged, plain])[0] == "Apples, raw, without skin"
    egg = Rankable("Egg", "Snickers", True, 1)
    whole = Rankable("Egg, whole, raw, fresh", None, False, 4, is_generic=True)
    assert best("egg", [egg, whole])[0] == "Egg, whole, raw, fresh"


def test_after_a_brand_part_the_item_may_have_one_more_word_than_was_typed() -> None:
    candy = Rankable("Candies, MARS SNACKFOOD US, SNICKERS Bar", None, False, 0, is_generic=True)
    minis = Rankable("Snickers, Snickers Minis", "Snickers", True, 1)
    assert best("snickers", [minis, candy])[0].startswith("Candies")


def test_a_plural_name_head_beats_a_dish_named_after_the_food() -> None:
    eggs = Rankable("Eggs, Grade A, Large, egg whole", None, False, 5, is_generic=True)
    dish = Rankable("Egg, Benedict", None, False, 0, is_generic=True)
    assert best("egg", [dish, eggs])[0].startswith("Eggs")
