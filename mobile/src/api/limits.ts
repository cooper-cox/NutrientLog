import { apiGet } from './client';

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
  return apiGet<Limits>('/api/v1/limits');
}
