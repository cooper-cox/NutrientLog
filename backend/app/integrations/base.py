"""What every outside food database must provide, so more can be added later.

USDA FoodData Central is the first. Open Food Facts (barcodes) can be added as another class with
the same two members, with no change to the service or the routes.
"""

from dataclasses import dataclass, field
from typing import Protocol


class FoodSourceError(Exception):
    """The outside database could not answer (down, slow, over its limit, or refused our key).

    The message is a plain sentence that is safe to show to the person.
    """


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


@dataclass(frozen=True)
class FoodPage:
    """One page of search results. `has_more` says whether asking for the next page finds more."""

    foods: list[FoodCandidate]
    has_more: bool


class FoodSource(Protocol):
    name: str

    def search(self, query: str, limit: int, page: int = 1) -> FoodPage:
        """One page (1 is the first) of foods matching `query`, best matches first.

        May raise FoodSourceError.
        """
        ...
