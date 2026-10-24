import { fireEvent, render, screen } from "@testing-library/react-native";

import App from "./App";
import { ApiError } from "./src/api/client";
import { getLimits } from "./src/api/endpoints";
import {
  getCurrentGoal,
  getProfile,
  type Goal,
  type Profile,
} from "./src/api/endpoints";
import {
  getDay,
  getMonth,
  getWeek,
  type Day,
  type Month,
  type Week,
} from "./src/api/food";
import { getActivities } from "./src/api/workouts";
import { getStoredToken } from "./src/storage/token";

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("./src/api/endpoints");
jest.mock("./src/api/food");
jest.mock("./src/api/workouts");
jest.mock("./src/storage/token");
jest.mock("./src/config", () => ({
  getApiBaseUrl: () => "http://192.168.1.5:8000",
}));

const mockGetToken = jest.mocked(getStoredToken);
const mockGetLimits = jest.mocked(getLimits);
const mockGetProfile = jest.mocked(getProfile);
const mockGetGoal = jest.mocked(getCurrentGoal);
const mockGetDay = jest.mocked(getDay);
const mockGetWeek = jest.mocked(getWeek);
const mockGetMonth = jest.mocked(getMonth);
const mockGetActivities = jest.mocked(getActivities);

const WEEK: Week = {
  end: "2026-10-18",
  days: [12, 13, 14, 15, 16, 17, 18].map((d) => ({
    date: `2026-10-${d}`,
    calories: 0,
    protein_g: 0,
    entries: 0,
    workouts: [],
    workout_minutes: 0,
  })),
  goal_calories: 3034,
  average_calories: null,
};
const MONTH: Month = {
  month: "2026-10",
  today: "2026-10-18",
  goal_calories: 3034,
  average_calories: null,
  days: Array.from({ length: 31 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    calories: 0,
    protein_g: 0,
    entries: 0,
    workouts: [],
    workout_minutes: 0,
  })),
};

const DAY: Day = {
  date: "2026-10-18",
  today: "2026-10-18",
  entries: [],
  totals: {},
  goal_calories: 3034,
  remaining_calories: 3034,
  workouts: [],
  burned: { resting: 1780, workouts: 0, total: 1780 },
  balance_calories: -1780,
};

const PROFILE: Profile = {
  name: "Cooper",
  sex: "male",
  birth_date: "1996-10-08",
  height_cm: 180,
  weight_kg: 80,
  goal_weight_kg: 85,
  activity_level: "moderate",
  goal_type: "gain",
  rate_kg_per_week: 0.25,
  timezone: "UTC",
  unit_preference: "metric",
  updated_at: "2026-10-10T00:00:00Z",
};
const GOAL = {
  calories: 3034,
  protein_g: 144,
  fat_g: 84,
  carb_g: 425,
  bmr: 1780,
  tdee: 2759,
  daily_adjustment: 275,
  rate_kg_per_week: 0.25,
  rate_was_capped: false,
  floor_was_applied: false,
  weeks_to_goal: 20,
} as Goal;

beforeEach(() => {
  // Reset only our own mocks: resetting everything would also wipe the safe-area mock above.
  for (const mock of [
    mockGetToken,
    mockGetProfile,
    mockGetGoal,
    mockGetLimits,
    mockGetDay,
    mockGetWeek,
    mockGetMonth,
    mockGetActivities,
  ]) {
    mock.mockReset();
  }
  mockGetDay.mockResolvedValue(DAY);
  mockGetWeek.mockResolvedValue(WEEK);
  mockGetMonth.mockResolvedValue(MONTH);
  mockGetActivities.mockResolvedValue({
    activities: [{ key: "walking", label: "Walking" }],
    intensities: ["light", "moderate", "hard"],
    max_minutes: 600,
  });
  // The survey asks the server for its limits; these tests don't need them.
  mockGetLimits.mockRejectedValue(new ApiError("Could not reach the server."));
});

describe("App", () => {
  it("shows the survey on first launch", async () => {
    mockGetToken.mockResolvedValue(null);
    render(<App />);
    expect(await screen.findByText("Let’s set your targets")).toBeTruthy();
  });

  function ready() {
    mockGetToken.mockResolvedValue("token");
    mockGetProfile.mockResolvedValue(PROFILE);
    mockGetGoal.mockResolvedValue(GOAL);
  }

  it("shows Home, with calories left and the four tabs, when the survey is already done", async () => {
    ready();
    render(<App />);
    expect(await screen.findByLabelText("3034 calories left")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    for (const name of ["Home", "Food", "Workout", "Profile"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    expect(
      screen.getByRole("tab", { name: "Home" }).props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it("switches between the four screens with the tab bar", async () => {
    ready();
    render(<App />);
    await screen.findByLabelText("3034 calories left");

    fireEvent.press(screen.getByRole("tab", { name: "Food" }));
    expect(await screen.findByLabelText("Search foods")).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Food" }).props.accessibilityState
        .selected,
    ).toBe(true);

    fireEvent.press(screen.getByRole("tab", { name: "Workout" }));
    expect(await screen.findByText("Add a workout")).toBeTruthy();

    fireEvent.press(screen.getByRole("tab", { name: "Profile" }));
    expect(await screen.findByText("Your goal")).toBeTruthy();

    fireEvent.press(screen.getByRole("tab", { name: "Home" }));
    expect(await screen.findByLabelText("3034 calories left")).toBeTruthy();
  });

  it("opens the calendar over the screen and keeps the tabs usable", async () => {
    ready();
    render(<App />);
    await screen.findByLabelText("3034 calories left");
    fireEvent.press(screen.getByLabelText("Open calendar"));
    expect(await screen.findByText("October 2026")).toBeTruthy();
    // The tab bar is still there, and using it closes the calendar.
    fireEvent.press(screen.getByRole("tab", { name: "Workout" }));
    expect(screen.queryByText("October 2026")).toBeNull();
    expect(await screen.findByText("Add a workout")).toBeTruthy();
  });

  it("closes the calendar with its Close button", async () => {
    ready();
    render(<App />);
    await screen.findByLabelText("3034 calories left");
    fireEvent.press(screen.getByLabelText("Open calendar"));
    await screen.findByText("October 2026");
    fireEvent.press(screen.getByLabelText("Close calendar"));
    expect(screen.queryByText("October 2026")).toBeNull();
  });

  it("opens the search from the Food tab and comes back", async () => {
    ready();
    render(<App />);
    await screen.findByLabelText("3034 calories left");
    fireEvent.press(screen.getByRole("tab", { name: "Food" }));
    fireEvent.press(await screen.findByLabelText("Search foods"));
    expect(screen.getByPlaceholderText(/Search, e.g./)).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Eaten today")).toBeTruthy();
  });

  it("opens the survey again, filled in, from Profile, and returns to Profile on Cancel", async () => {
    ready();
    render(<App />);
    await screen.findByLabelText("3034 calories left");
    fireEvent.press(screen.getByRole("tab", { name: "Profile" }));
    fireEvent.press(
      await screen.findByRole("button", { name: "Edit my answers" }),
    );

    expect(
      screen.getByLabelText("Current weight in kilograms").props.value,
    ).toBe("80");
    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Your goal")).toBeTruthy();
  });

  it("explains a connection problem and offers to try again", async () => {
    mockGetToken.mockResolvedValue("token");
    mockGetProfile.mockRejectedValueOnce(
      new ApiError("Could not reach the server."),
    );
    render(<App />);

    expect(await screen.findByText("Could not reach the server.")).toBeTruthy();
    expect(screen.getByText(/same Wi-Fi/)).toBeTruthy();

    mockGetProfile.mockResolvedValue(PROFILE);
    mockGetGoal.mockResolvedValue(GOAL);
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByLabelText("3034 calories left")).toBeTruthy();
  });
});
