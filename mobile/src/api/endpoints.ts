/** Every call to the server, in one place: health checks, the limits, users, profile and goals. */
import { apiGet, apiRequest } from "./client";

export type Sex = "male" | "female" | "no_answer";
export type ActivityLevel =
  "sedentary" | "light" | "moderate" | "very_active" | "extra_active";
export type GoalType = "gain" | "lose" | "maintain";
export type UnitPreference = "metric" | "imperial";

/** The survey answers. Always metric: the app converts if the person prefers lb and ft. */
export type ProfileIn = {
  name: string | null;
  sex: Sex;
  birth_date: string; // YYYY-MM-DD
  height_cm: number;
  weight_kg: number;
  goal_weight_kg: number | null;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  rate_kg_per_week: number;
  timezone: string;
  unit_preference: UnitPreference;
};

export type Profile = ProfileIn & { updated_at: string };

export type Goal = {
  effective_from: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  weight_kg: number;
  bmr: number;
  tdee: number;
  daily_adjustment: number;
  rate_kg_per_week: number;
  rate_was_capped: boolean;
  floor_was_applied: boolean;
  weeks_to_goal: number | null;
};

export type ProfileSaved = { profile: Profile; goal: Goal };

export type UserCreated = { user_id: string; token: string };

export function createUser(): Promise<UserCreated> {
  return apiRequest<UserCreated>("POST", "/api/v1/users");
}

export function getProfile(token: string): Promise<Profile> {
  return apiGet<Profile>("/api/v1/users/me/profile", { token });
}

export function saveProfile(
  token: string,
  answers: ProfileIn,
): Promise<ProfileSaved> {
  return apiRequest<ProfileSaved>("PUT", "/api/v1/users/me/profile", {
    token,
    body: answers,
  });
}

export function getCurrentGoal(token: string): Promise<Goal> {
  return apiGet<Goal>("/api/v1/goals/current", { token });
}

// --- health checks ---

export type HealthResponse = {
  status: string;
};

export type DatabaseHealthResponse = {
  status: string;
  database: string;
};

/** Is the API process up? */
export function getHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>("/health");
}

/** Can the API reach its database? */
export function getDatabaseHealth(): Promise<DatabaseHealthResponse> {
  return apiGet<DatabaseHealthResponse>("/health/db");
}

// --- limits ---

/** The numbers the server checks the survey answers against. The app never keeps its own copy. */
export type Limits = {
  min_age_years: number;
  max_age_years: number;
  min_height_cm: number;
  max_height_cm: number;
  min_weight_kg: number;
  max_weight_kg: number;
  /** Height and weight that can't both be right. */
  min_plausible_bmi: number;
  max_plausible_bmi: number;
  /** Goal weights: the lowest allowed when losing weight, and the highest allowed for anyone. */
  min_goal_bmi_when_losing: number;
  max_goal_bmi: number;
  max_gain_kg_per_week: number;
  max_lose_kg_per_week: number;
};

export function getLimits(): Promise<Limits> {
  return apiGet<Limits>("/api/v1/limits");
}
