/** Calls about workouts and calories burned. Each one signs in with the saved login token. */
import { getStoredToken } from "../storage/token";
import { ApiError, apiGet, apiRequest } from "./client";

export type Workout = {
  id: string;
  logged_on: string;
  activity: string;
  /** "Weight training", "Walking"... */
  label: string;
  minutes: number;
  intensity: string;
  calories: number;
  /** True when the person typed the calories instead of using the estimate. */
  calories_typed: boolean;
};

/** Calories burned in a day: resting (null until there is a profile) plus workouts. */
export type Burned = {
  resting: number | null;
  workouts: number;
  total: number;
};

export type Activities = {
  activities: { key: string; label: string }[];
  intensities: string[];
  max_minutes: number;
};

export type WorkoutToAdd = {
  activity: string;
  minutes: number;
  intensity: string;
  /** Leave out to estimate; send what a watch said to use that instead. */
  calories?: number;
  /** YYYY-MM-DD; left out for today. */
  loggedOn?: string;
};

async function token(): Promise<string> {
  const saved = await getStoredToken();
  if (!saved) throw new ApiError("You are signed out. Restart the app.", 401);
  return saved;
}

export async function getActivities(): Promise<Activities> {
  return apiGet<Activities>("/api/v1/workouts/activities", {
    token: await token(),
  });
}

/** Log a workout. Rejects with the reason (an ApiError with fieldErrors) if it is not valid. */
export async function addWorkout(workout: WorkoutToAdd): Promise<Workout> {
  const { loggedOn, ...rest } = workout;
  return apiRequest<Workout>("POST", "/api/v1/workouts", {
    token: await token(),
    body: { ...rest, ...(loggedOn ? { logged_on: loggedOn } : {}) },
  });
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await apiRequest<void>("DELETE", `/api/v1/workouts/${workoutId}`, {
    token: await token(),
  });
}
