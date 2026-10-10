import { apiGet, apiRequest } from './client';

export type Sex = 'male' | 'female' | 'no_answer';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active' | 'extra_active';
export type GoalType = 'gain' | 'lose' | 'maintain';
export type UnitPreference = 'metric' | 'imperial';

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
  return apiRequest<UserCreated>('POST', '/api/v1/users');
}

export function getProfile(token: string): Promise<Profile> {
  return apiGet<Profile>('/api/v1/users/me/profile', { token });
}

export function saveProfile(token: string, answers: ProfileIn): Promise<ProfileSaved> {
  return apiRequest<ProfileSaved>('PUT', '/api/v1/users/me/profile', { token, body: answers });
}

export function getCurrentGoal(token: string): Promise<Goal> {
  return apiGet<Goal>('/api/v1/goals/current', { token });
}
