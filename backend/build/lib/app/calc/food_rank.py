"""Ordering search results so the food the person meant comes first.

One typed phrase is compared with each candidate's name and brand. Everything here is plain,
tested code: no guessing, no outside calls. The weights are the knobs to adjust once the real
search check (``scripts/search_check.py``) shows which results people would expect.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass

from app.settings import settings

# Words that carry no meaning for matching ("bar of chocolate" should match "chocolate bar").
_FILLER = frozenset({"a", "an", "and", "of", "the", "with", "in", "for", "&"})
_WORD = re.compile(r"[a-z0-9]+")
# Package-size words: "JIF 12 OUNCE CREAMY ... Each" and "JIF 28 Ounce CREAMY" are one product.
_SIZE_WORDS = frozenset(
    {"each", "ounce", "oz", "count", "case", "ct", "pk", "pack", "lb", "lbs", "fl", "pound"}
)
# Words that, in a short generic result, usually mean "the plain food itself".
_PLAIN_WORDS = frozenset({"raw", "cooked", "plain", "fresh"})
_RAW_WORDS = frozenset({"raw", "fresh"})

# Score weights. Coverage of the typed words dominates; the rest breaks ties sensibly.
W_COVERAGE = settings.ranking.coverage  # share of the typed words found in the name or brand
W_ALL_FOUND = settings.ranking.all_found  # every typed word found
W_NAME_ONLY = settings.ranking.name_only  # share of the typed words found in the name itself
W_BRAND_AND_NAME = (
    settings.ranking.brand_and_name
)  # brand words in the brand, the rest in the name ("clif" + "bar")
W_EXACT_NAME = (
    settings.ranking.exact_name
)  # a curated food named exactly as typed, in any order ("Milk, whole")
W_PLURAL_HEAD = (
    settings.ranking.plural_head
)  # one typed word, and a curated name that starts with its plural ("Eggs, ...")
W_STARTS_WITH = (
    settings.ranking.starts_with
)  # the name begins with the first typed word ("Oreo ...", "Banana ...")
W_GENERIC_FOOD = (
    settings.ranking.generic_food
)  # short query and a curated plain food ("banana", "flour")
W_PLAIN_WORD = (
    settings.ranking.plain_word
)  # a plain food whose name says raw / cooked / plain / fresh
P_EXTRA_WORD = (
    settings.ranking.extra_word
)  # per name word that was not typed (shorter, more exact names win)
P_EXTRA_CAP = settings.ranking.extra_cap
P_ENERGY_MISMATCH = (
    settings.ranking.energy_mismatch
)  # the calories disagree with the protein, carbs and fat
W_HAS_SERVING = settings.ranking.has_serving
W_SOURCE_ORDER = (
    settings.ranking.source_order
)  # the source's own relevance, as a tiebreaker (fades over 50 places)
CLOSE_WORD = (
    settings.ranking.close_word
)  # credit for a typed word that is the start of a name word ("banan")
PLURAL_ONLY = (
    settings.ranking.plural_only
)  # credit when a typed plural only matches a singular ("snickers" ~ "snicker")
TYPO_WORD = settings.ranking.typo_word  # credit for a word one letter off ("chiken")
SHORT_QUERY_WORDS = 3
STARTS_WITH_MAX_WORDS = (
    2  # longer queries are "brand + flavour", where the first word is not the food
)
MIN_PREFIX = 3
SEGMENTS_CHECKED = 3  # a curated name is "Category, item" or "Category, BRAND, item"
MIN_TYPO_LENGTH = 5


@dataclass(frozen=True)
class Rankable:
    """What ranking needs to know about one candidate."""

    name: str
    brand: str | None
    has_serving: bool
    # Place in the source's own result list (0 = first).
    source_position: int
    is_generic: bool = False
    energy_mismatch: bool = False


def _fold(word: str) -> str:
    """A simple singular: "bananas" -> "banana" (words of 3 letters or fewer are left alone)."""
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def raw_words(text: str) -> list[str]:
    """Lower-case words with filler removed, exactly as written ("snickers" stays "snickers")."""
    return [word for word in _WORD.findall(text.lower().replace("'", "")) if word not in _FILLER]


def words(text: str) -> list[str]:
    """Lower-case words with filler removed and simple plurals folded ("bananas" -> "banana")."""
    return [_fold(word) for word in raw_words(text)]


class _Text:
    """The words of a name or brand, both as written and with plurals folded."""

    def __init__(self, text: str) -> None:
        self.raw = set(raw_words(text))
        self.folded = {_fold(word) for word in self.raw}


def _one_letter_off(a: str, b: str) -> bool:
    """True if the words differ by one inserted, missing, or changed letter."""
    if a == b or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b, strict=True)) == 1
    short, long = (a, b) if len(a) < len(b) else (b, a)
    return any(long[:i] + long[i + 1 :] == short for i in range(len(long)))


def _credit(word: str, text: _Text) -> float:
    """How well one typed word is found in a name or brand: 1, partly, or not at all.

    `word` is as typed. A typed singular finds a plural name in full ("banana" ~ "Bananas"),
    but a typed plural that only matches a singular earns a little less ("snickers" ~
    "Snicker Doodle"), because a typed "s" is often part of a brand or product name.
    """
    if word in text.raw:
        return 1.0
    folded = _fold(word)
    if folded in text.folded:
        return 1.0 if folded == word else PLURAL_ONLY
    if len(folded) >= MIN_PREFIX and any(other.startswith(folded) for other in text.folded):
        return CLOSE_WORD
    if len(folded) >= MIN_TYPO_LENGTH and any(_one_letter_off(folded, o) for o in text.folded):
        return TYPO_WORD
    return 0.0


def coverage(query: str, name: str, brand: str | None) -> float:
    """How many of the typed words are found in the name or brand, 0 to the number of words."""
    name_text, brand_text = _Text(name), _Text(brand or "")
    return sum(max(_credit(w, name_text), _credit(w, brand_text)) for w in raw_words(query))


def _segment_is_item(name: str, typed: set[str]) -> bool:
    """True if a later comma-separated part of a curated name is made only of typed words.

    USDA curated names are "Category, item, detail" or "Category, BRAND, item": in "Fish, salmon,
    Atlantic, raw" and "Candies, MARS SNACKFOOD US, SNICKERS Bar" the typed "salmon" and
    "snickers bar" are the item itself. A part with other words in it ("The COCA-COLA company")
    is not the item, so a brand that merely appears in a part earns nothing. A packaged
    product ("Apple [Treecrisp 2 Go]") never gets this: only curated foods have this layout.
    """
    for index, part in enumerate(name.split(",")[1:SEGMENTS_CHECKED], start=1):
        part_words = set(words(part))
        if not part_words:
            continue
        if part_words <= typed:
            return True
        # After a brand part ("..., MARS SNACKFOOD US, SNICKERS Bar") the item may carry one more
        # word than was typed ("snickers" ~ "SNICKERS Bar").
        if index == SEGMENTS_CHECKED - 1 and typed <= part_words and len(part_words - typed) <= 1:
            return True
    return False


def score(query: str, item: Rankable) -> float:
    typed = raw_words(query)
    if not typed:
        return 0.0
    name_text, brand_text = _Text(item.name), _Text(item.brand or "")
    name_set = set(words(item.name))
    credits = [_credit(word, name_text) for word in typed]

    in_name = sum(credits)
    in_brand = sum(
        _credit(word, brand_text)
        for word, in_credit in zip(typed, credits, strict=True)
        if in_credit == 0.0
    )
    found = in_name + in_brand
    full = found >= len(typed) - 1e-9

    total = W_COVERAGE * found / len(typed)
    total += W_NAME_ONLY * in_name / len(typed)
    if full:
        total += W_ALL_FOUND
    if in_brand and in_name:
        total += W_BRAND_AND_NAME
    name_list = words(item.name)
    typed_folded = set(words(query))
    # "Named for what was typed": the name begins with a typed word, or (curated foods only) a
    # later part of it is the typed item. Brand + flavour queries ("clif bar peanut butter") are
    # not about the first word, so the start-of-name bonus is only for short queries.
    begins_head = bool(name_list) and any(_credit(w, _Text(name_list[0])) > 0 for w in typed)
    item_part = item.is_generic and _segment_is_item(item.name, typed_folded)
    if len(typed) <= STARTS_WITH_MAX_WORDS and (
        (name_list and _credit(typed[0], _Text(name_list[0])) == 1.0) or item_part
    ):
        total += W_STARTS_WITH
    if item.is_generic and name_set == typed_folded:
        total += W_EXACT_NAME
    # "Eggs, Grade A, Large" is the food itself; "Egg, deviled" and "Egg, Benedict" are dishes.
    first_raw = raw_words(item.name)[:1]
    if (
        item.is_generic
        and len(typed) == 1
        and first_raw
        and first_raw[0] != typed[0]
        and _fold(first_raw[0]) == typed[0]
    ):
        total += W_PLURAL_HEAD
    # A plain-food bonus only when the food is named for what was typed ("Bananas, raw", not
    # "Beverages, ... Coca-Cola" or "McDonald's McFlurry with Oreo").
    if item.is_generic and len(typed) <= SHORT_QUERY_WORDS and (begins_head or item_part):
        total += W_GENERIC_FOOD
        # "raw" or "fresh" says "the ingredient itself"; "cooked" can mean a processed dish
        # ("Ham, honey, smoked, cooked"), so for a part-match only raw and fresh count.
        if name_set & (_PLAIN_WORDS if begins_head else _RAW_WORDS):
            total += W_PLAIN_WORD

    extra = len(name_set - set(words(query)))
    total -= min(extra * P_EXTRA_WORD, P_EXTRA_CAP)
    if item.energy_mismatch:
        total -= P_ENERGY_MISMATCH
    if item.has_serving:
        total += W_HAS_SERVING
    total += max(0.0, W_SOURCE_ORDER * (1 - item.source_position / 50))
    return total


def rank(query: str, items: Sequence[Rankable]) -> list[int]:
    """Indexes of `items`, best match first (ties keep their original order).

    A candidate that shares no word at all with the query is left out: it only came back because
    the database searched ingredients or translations, and listing it would just be noise.
    """
    scores = [score(query, item) for item in items]
    keep = [i for i, item in enumerate(items) if coverage(query, item.name, item.brand) > 0]
    return sorted(keep, key=lambda index: (-scores[index], index))


def full_matches(query: str, items: Sequence[Rankable]) -> int:
    """How many candidates contain every typed word (in the name or brand)."""
    wanted = len(words(query))
    return sum(coverage(query, item.name, item.brand) >= wanted - 1e-9 for item in items)


def duplicate_key(
    name: str, brand: str | None, calories: float | None, serving_grams: float | None
) -> tuple[frozenset[str], frozenset[str], int | None, int | None]:
    """Two results with the same key are the same product listed more than once.

    Sizes and pack words are ignored ("12 OUNCE ... Each" and "28 Ounce ..." match) as is word
    order and repetition, but the nutrition and serving must agree, so real variants stay apart.
    """
    name_words = frozenset(w for w in words(name) if w not in _SIZE_WORDS and not w.isdigit())
    return (
        name_words,
        frozenset(words(brand or "")),
        None if calories is None else round(calories),
        None if serving_grams is None else round(serving_grams),
    )
