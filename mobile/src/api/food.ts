/** Calls about foods, amounts and the day's log. Each one signs in with the saved login token. */
import { getStoredToken } from "../storage/token";
import { ApiError, apiGet, apiRequest } from "./client";

/** Every nutrient we track; null means "unknown", which is not the same as zero. */
export type Nutrients = Record<string, number | null>;

export type Serving = { label: string; grams: number; nutrients?: Nutrients };

export type SavedFood = {
  id: string;
  name: string;
  brand: string | null;
  nutrients: Nutrients;
  servings: Serving[];
};

/** A search result from an outside database; it is saved when someone logs it. */
export type FoodCandidate = {
  source: string;
  source_id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  nutrients: Nutrients;
  servings: Serving[];
};

export type SourceStatus = {
  name: string;
  available: boolean;
  message: string | null;
};

export type SearchResult = {
  saved: SavedFood[];
  results: FoodCandidate[];
  sources: SourceStatus[];
  has_more: boolean;
};

export type FoodToSave = {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  nutrients: Nutrients;
  servings: { label: string; grams: number }[];
  source: "manual" | "usda" | "off";
  source_id?: string | null;
};

export type LogEntry = {
  id: string;
  food_id: string;
  food_name: string;
  brand: string | null;
  logged_on: string;
  grams: number;
  amount_text: string | null;
  nutrients: Nutrients;
};

export type Day = {
  date: string;
  entries: LogEntry[];
  totals: Nutrients;
  goal_calories: number | null;
  remaining_calories: number | null;
};

async function token(): Promise<string> {
  const saved = await getStoredToken();
  if (!saved) throw new ApiError("You are signed out. Restart the app.", 401);
  return saved;
}

export async function searchFoods(
  query: string,
  page = 1,
): Promise<SearchResult> {
  const path = `/api/v1/foods/search?q=${encodeURIComponent(query)}&page=${page}`;
  return apiGet<SearchResult>(path, { token: await token(), timeoutMs: 20000 });
}

export async function getMeasures(
  source: string,
  sourceId: string,
): Promise<Serving[]> {
  const path = `/api/v1/foods/measures?source=${encodeURIComponent(source)}&source_id=${encodeURIComponent(sourceId)}`;
  const reply = await apiGet<{ servings: Serving[] }>(path, {
    token: await token(),
  });
  return reply.servings;
}

export async function saveFood(food: FoodToSave): Promise<SavedFood> {
  return apiRequest<SavedFood>("POST", "/api/v1/foods", {
    token: await token(),
    body: food,
  });
}

/** Turn "1/2 cup" (and what is known about the food) into grams. Rejects with the reason. */
export async function amountToGrams(
  text: string,
  foodName: string,
  servings: Serving[],
): Promise<{ grams: number }> {
  return apiRequest<{ grams: number }>("POST", "/api/v1/amounts/to-grams", {
    token: await token(),
    body: {
      text,
      food_name: foodName,
      servings: servings.map(({ label, grams }) => ({ label, grams })),
    },
  });
}

export async function addLogEntry(
  foodId: string,
  grams: number,
  amountText: string,
): Promise<void> {
  await apiRequest<LogEntry>("POST", "/api/v1/log", {
    token: await token(),
    body: { food_id: foodId, grams, amount_text: amountText },
  });
}

export async function getDay(): Promise<Day> {
  return apiGet<Day>("/api/v1/log", { token: await token() });
}

export async function deleteLogEntry(entryId: string): Promise<void> {
  await apiRequest<void>("DELETE", `/api/v1/log/${entryId}`, {
    token: await token(),
  });
}
