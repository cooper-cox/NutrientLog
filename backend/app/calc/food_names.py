"""Tidying the names that food databases give products, so a list of results is easy to read."""

import re

# Corporate endings that say nothing about the product: "Red Bull North America, Inc." is Red Bull.
_ENDINGS = re.compile(
    r"[\s,.]+(?:and company|& company|& co|and co|company|co|inc|llc|ltd|corp|corporation|"
    r"north america|usa|us|na)$",
    re.IGNORECASE,
)
_WORD = re.compile(r"[a-z0-9]+")


def short_brand(brand: str) -> str:
    """ "Clif Bar And Company" -> "Clif Bar"; "Red Bull North America, Inc." -> "Red Bull"."""
    text = " ".join(brand.split())
    while True:
        shorter = _ENDINGS.sub("", text).strip(" ,.")
        if shorter == text or not shorter:
            return text
        text = shorter


def drop_repeated_flavor(name: str) -> str:
    """ "Dark Chocolate Nuts & Sea Salt Bars, Dark Chocolate Nuts & Sea Salt" -> the part before the
    comma: when the words after the first comma are all in the first part, they add nothing."""
    first, separator, rest = name.partition(",")
    if not separator:
        return name
    first_words = set(_WORD.findall(first.lower()))
    rest_words = set(_WORD.findall(rest.lower()))
    if rest_words and rest_words <= first_words:
        return first.strip()
    return name.strip()


def brand_key(brand: str | None) -> str | None:
    """The first word of the short brand ("Clif Bar And Company" and "Clif" both give "clif")."""
    words = _WORD.findall(short_brand(brand).lower()) if brand else []
    return words[0] if words else None
