"""Default protein, fat, and carbohydrate targets for a daily calorie target.

These are starting points, not prescriptions. The app later compares them with the user's
real weight trend, and the numbers can be changed in one place (the constants below).

  - Protein: 1.8 g per kg of body weight, but never more than 35% of calories.
  - Fat: 25% of calories.
  - Carbohydrate: everything that is left.

Calories per gram: protein 4, carbohydrate 4, fat 9.
"""

from dataclasses import dataclass

PROTEIN_G_PER_KG = 1.8
MAX_PROTEIN_FRACTION = 0.35
FAT_FRACTION = 0.25

KCAL_PER_G_PROTEIN = 4
KCAL_PER_G_CARB = 4
KCAL_PER_G_FAT = 9


@dataclass(frozen=True)
class MacroTargets:
    protein_g: int
    fat_g: int
    carb_g: int


def calculate_macro_targets(calories: float, weight_kg: float) -> MacroTargets:
    if calories <= 0:
        raise ValueError("calories must be greater than zero")
    if weight_kg <= 0:
        raise ValueError("weight_kg must be greater than zero")

    protein_g = min(
        PROTEIN_G_PER_KG * weight_kg,
        MAX_PROTEIN_FRACTION * calories / KCAL_PER_G_PROTEIN,
    )
    fat_g = FAT_FRACTION * calories / KCAL_PER_G_FAT
    carb_kcal = calories - protein_g * KCAL_PER_G_PROTEIN - fat_g * KCAL_PER_G_FAT
    carb_g = carb_kcal / KCAL_PER_G_CARB

    return MacroTargets(protein_g=round(protein_g), fat_g=round(fat_g), carb_g=round(carb_g))
