"""What every outside food database must provide, so more can be added later.

USDA FoodData Central is the first. Open Food Facts (barcodes) can be added as another class with
the same two members, with no change to the service or the routes.
"""

import re
from dataclasses import dataclass, field
from typing import Protocol

MAX_DETAIL_CHARS = 200  # how much of an error reply is kept for the developer


class FoodSourceError(Exception):
    """The outside database could not answer (down, slow, over its limit, or refused our key).

    The message is a plain sentence that is safe to show to the person. ``detail`` is for the
    developer (for example the HTTP status), and is never shown in the app.
    """

    def __init__(self, message: str, detail: str = "") -> None:
        super().__init__(message)
        self.detail = detail


@dataclass(frozen=True)
class ServingCandidate:
    label: str
    grams: float


@dataclass(frozen=True)
class FoodCandidate:
    """A food found in an outside database, not saved yet. Nutrients are per 100 g."""

    source: str  # "usda"
    source_id: str  # the database's own id (USDA calls it fdcId)
    name: str
    brand: str | None
    barcode: str | None
    # Every catalog nutrient is present; None means the database doesn't say (not zero).
    nutrients: dict[str, float | None]
    servings: list[ServingCandidate] = field(default_factory=list)
    # A plain whole food from a curated list ("Bananas, raw"), not a packaged product or a
    # community entry. Short searches prefer these.
    is_generic: bool = False


@dataclass(frozen=True)
class FoodPage:
    """One page of search results. `has_more` says whether asking for the next page finds more."""

    foods: list[FoodCandidate]
    has_more: bool


class FoodSource(Protocol):
    name: str
    # A fallback source is only asked when the main ones found no really good match, because
    # it is slower or limits how often it can be asked (Open Food Facts: about 10 searches a
    # minute).
    fallback: bool

    def search(self, query: str, limit: int, page: int = 1) -> FoodPage:
        """One page (1 is the first) of foods matching `query`, best matches first.

        May raise FoodSourceError.
        """
        ...


def reply_snippet(text: str) -> str:
    """The start of an error reply on one line, for the developer (": ..."), or "" if empty.

    A web page ("Page temporarily unavailable") is reduced to its title. Never contains our key:
    keys are sent in headers, which are not part of a reply.
    """
    title = re.search(r"<title>(.*?)</title>", text, re.I | re.S)
    shown = title[1] if title else text
    shown = " ".join(shown.split())[:MAX_DETAIL_CHARS]
    return f": {shown}" if shown else ""
