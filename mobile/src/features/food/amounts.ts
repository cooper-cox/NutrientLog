/** Small pure helpers for the add-food screen: no network, easy to test. */
import type {
  FoodCandidate,
  Nutrients,
  SavedFood,
  Serving,
} from "../../api/food";

/** "1 medium (118 g)" -> "1 medium": what to type to mean that serving. */
export function servingAmountText(label: string): string {
  return label.replace(/\s*\(.*$/, "").trim();
}

/** What the amount box starts with: the food's first serving, or 100 g if it has none. */
export function defaultAmountText(servings: Serving[]): string {
  const first = servings[0];
  return first ? servingAmountText(first.label) || "100 g" : "100 g";
}

/** The amount of one nutrient in `grams` of a food, or null when the food doesn't say. */
export function nutrientIn(
  per100g: Nutrients,
  key: string,
  grams: number,
): number | null {
  const value = per100g[key];
  return value === null || value === undefined ? null : (value * grams) / 100;
}

/** "250 kcal", rounded the way people read it; "?" if unknown. */
export function kcalText(kcal: number | null): string {
  return kcal === null ? "? kcal" : `${Math.round(kcal)} kcal`;
}

function oneDecimal(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * The line under a search result, so near-identical products can be told apart at a glance:
 * calories and protein for one serving ("260 kcal · 11 g protein per 1 bar (68 g)"), or per
 * 100 g when the food has no serving.
 */
export function resultLine(food: {
  nutrients: Nutrients;
  servings: Serving[];
}): string {
  const first = food.servings[0];
  const grams = first ? first.grams : 100;
  const kcal = nutrientIn(food.nutrients, "calories", grams);
  const protein = nutrientIn(food.nutrients, "protein_g", grams);
  const proteinText =
    protein === null ? "" : ` · ${oneDecimal(protein)} g protein`;
  const per = first
    ? `${servingAmountText(first.label) || "serving"} (${oneDecimal(grams)} g)`
    : "100 g";
  return `${kcalText(kcal)}${proteinText} per ${per}`;
}

/** The food's servings plus any extra measures, without repeating one. */
export function mergeServings(own: Serving[], extra: Serving[]): Serving[] {
  const seen = new Set(own.map((serving) => serving.label.toLowerCase()));
  const added = extra.filter(
    (serving) => !seen.has(serving.label.toLowerCase()),
  );
  return [...own, ...added];
}

export type PickedFood =
  | { kind: "saved"; food: SavedFood }
  | { kind: "candidate"; food: FoodCandidate };

/** A number typed in a box; commas count as decimal points. Null if empty or not a number. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export type ManualForm = {
  name: string;
  /** What one serving is called: "1 bar", "1 cup". */
  servingLabel: string;
  servingGrams: string;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
};

export const EMPTY_MANUAL: ManualForm = {
  name: "",
  servingLabel: "1 serving",
  servingGrams: "",
  calories: "",
  protein: "",
  fat: "",
  carbs: "",
};

/**
 * What was typed from a package label ("per serving") as a food: nutrients are stored per
 * 100 g, so each is scaled up from the serving. Returns the first problem as a sentence.
 */
export function manualFood(
  form: ManualForm,
): { ok: true; food: SavedFoodDraft } | { ok: false; message: string } {
  const name = form.name.trim();
  if (!name) return { ok: false, message: "Give the food a name." };
  const grams = parseNumber(form.servingGrams);
  if (grams === null || grams <= 0) {
    return {
      ok: false,
      message: 'Enter the serving size in grams (look for "serving size").',
    };
  }
  const calories = parseNumber(form.calories);
  if (calories === null || calories < 0) {
    return { ok: false, message: "Enter the calories in one serving." };
  }
  const nutrients: Nutrients = { calories: (calories * 100) / grams };
  const optional: [string, string, string][] = [
    ["protein_g", form.protein, "protein"],
    ["fat_g", form.fat, "fat"],
    ["carb_g", form.carbs, "carbs"],
  ];
  for (const [key, text, label] of optional) {
    if (text.trim() === "") continue;
    const value = parseNumber(text);
    if (value === null || value < 0)
      return { ok: false, message: `Check the ${label} amount.` };
    nutrients[key] = (value * 100) / grams;
  }
  return {
    ok: true,
    food: {
      name,
      nutrients,
      servings: [
        { label: form.servingLabel.trim().slice(0, 60) || "1 serving", grams },
      ],
      source: "manual",
    },
  };
}

type SavedFoodDraft = {
  name: string;
  nutrients: Nutrients;
  servings: { label: string; grams: number }[];
  source: "manual";
};

/**
 * A copy of a food's numbers for one serving, ready to correct by hand when a database entry is
 * wrong (the original is never changed). Only calories, protein, fat and carbs are carried over.
 */
export function manualFormFrom(food: {
  name: string;
  nutrients: Nutrients;
  servings: Serving[];
}): ManualForm {
  const first = food.servings[0];
  const grams = first ? first.grams : 100;
  const text = (key: string) => {
    const value = nutrientIn(food.nutrients, key, grams);
    return value === null ? "" : oneDecimal(value);
  };
  return {
    name: food.name,
    servingLabel: first
      ? servingAmountText(first.label) || "1 serving"
      : "100 g",
    servingGrams: oneDecimal(grams),
    calories: text("calories"),
    protein: text("protein_g"),
    fat: text("fat_g"),
    carbs: text("carb_g"),
  };
}

/**
 * The name shown in lists: brand first, then the product and its flavour, so lookalikes read
 * clearly: "Clif Bar · Nut Butter Bar – Peanut Butter". Plain foods ("Bananas, raw") are as is.
 */
export function displayName(food: {
  name: string;
  brand: string | null;
}): string {
  const product = food.name.replace(/,\s*/, " – ");
  const brand = food.brand?.trim();
  if (!brand) return food.name;
  return food.name.toLowerCase().startsWith(brand.toLowerCase())
    ? product
    : `${brand} · ${product}`;
}
