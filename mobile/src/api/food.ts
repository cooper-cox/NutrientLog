/** Calls about foods, amounts and the day's log. Each one signs in with the saved login token. */
import { getStoredToken } from "../storage/token";
import { ApiError, apiGet, apiRequest } from "./client";
import type { Burned, Workout } from "./workouts";

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
  /** How long it took to answer, in milliseconds. */
  took_ms?: number | null;
};

export type SearchResult = {
  saved: SavedFood[];
  results: FoodCandidate[];
  sources: SourceStatus[];
  has_more: boolean;
  /** True when a slower database will add results if the search is asked again in full. */
  more_coming: boolean;
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
  /** The person's own today, so the app knows whether this is today. */
  today: string;
  entries: LogEntry[];
  totals: Nutrients;
  goal_calories: number | null;
  remaining_calories: number | null;
  workouts: Workout[];
  burned: Burned;
  /** Eaten minus burned: positive is a surplus, negative a deficit. */
  balance_calories: number;
};

export type WeekDay = {
  date: string;
  calories: number;
  protein_g: number;
  entries: number;
  /** Short names of the workouts done that day ("Run", "Lift"), in the order done. */
  workouts: string[];
  /** Total workout minutes that day, for the weekly chart. */
  workout_minutes: number;
};

export type Week = {
  end: string;
  days: WeekDay[];
  goal_calories: number | null;
  average_calories: number | null;
};

export type Month = {
  month: string;
  today: string;
  days: WeekDay[];
  goal_calories: number | null;
  average_calories: number | null;
};

async function token(): Promise<string> {
  const saved = await getStoredToken();
  if (!saved) throw new ApiError("You are signed out. Restart the app.", 401);
  return saved;
}

/**
 * Search the food databases. "fast" answers from the main database only (about a second);
 * if it says `more_coming`, ask again with "full" to add the slower database.
 */
export async function searchFoods(
  query: string,
  page = 1,
  scope: "fast" | "full" = "full",
): Promise<SearchResult> {
  const path = `/api/v1/foods/search?q=${encodeURIComponent(query)}&page=${page}&scope=${scope}`;
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

/** One choice on the amount wheel. `grams` is the weight of ONE of it. */
export type Portion = {
  label: string;
  grams: number;
  /** "own": the food's own serving; "rough": an estimate (bowl, plate); "exact": g, oz, cup... */
  kind: "own" | "rough" | "exact";
  /** For rough sizes: "about 4.3 oz (123 g)". */
  note: string;
  /** How many of it the wheel offers: 0.25, 0.5, 1, 1.5, 2... */
  quantities: number[];
};

/** The choices for "how much?" for one food: its own servings, rough sizes, exact units. */
export async function getPortions(
  foodName: string,
  servings: Serving[],
): Promise<Portion[]> {
  const reply = await apiRequest<{ portions: Portion[] }>(
    "POST",
    "/api/v1/foods/portions",
    {
      token: await token(),
      body: {
        food_name: foodName,
        servings: servings.map(({ label, grams }) => ({ label, grams })),
      },
    },
  );
  return reply.portions;
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

/** Log a food. `loggedOn` (YYYY-MM-DD) is left out for today. */
export async function addLogEntry(
  foodId: string,
  grams: number,
  amountText: string,
  loggedOn?: string,
): Promise<void> {
  await apiRequest<LogEntry>("POST", "/api/v1/log", {
    token: await token(),
    body: {
      food_id: foodId,
      grams,
      amount_text: amountText,
      ...(loggedOn ? { logged_on: loggedOn } : {}),
    },
  });
}

/** One day's log; `date` (YYYY-MM-DD) is left out for today. */
export async function getDay(date?: string): Promise<Day> {
  const path = date
    ? `/api/v1/log?date=${encodeURIComponent(date)}`
    : "/api/v1/log";
  return apiGet<Day>(path, { token: await token() });
}

/** The seven days ending on `end` (left out for today). */
export async function getWeek(end?: string): Promise<Week> {
  const path = end
    ? `/api/v1/log/week?end=${encodeURIComponent(end)}`
    : "/api/v1/log/week";
  return apiGet<Week>(path, { token: await token() });
}

/** Every day of a month ("2026-10"; left out for this month). */
export async function getMonth(month?: string): Promise<Month> {
  const path = month
    ? `/api/v1/log/month?month=${encodeURIComponent(month)}`
    : "/api/v1/log/month";
  return apiGet<Month>(path, { token: await token() });
}

/** Give an entry a new amount, typed like "2 bars". Rejects with the reason. */
export async function changeLogEntry(
  entryId: string,
  amountText: string,
): Promise<LogEntry> {
  return apiRequest<LogEntry>("PATCH", `/api/v1/log/${entryId}`, {
    token: await token(),
    body: { amount_text: amountText },
  });
}

export async function deleteLogEntry(entryId: string): Promise<void> {
  await apiRequest<void>("DELETE", `/api/v1/log/${entryId}`, {
    token: await token(),
  });
}
