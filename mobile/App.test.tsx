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
import { getDay, type Day } from "./src/api/food";
import { getStoredToken } from "./src/storage/token";

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("./src/api/endpoints");
jest.mock("./src/api/food");
jest.mock("./src/storage/token");
jest.mock("./src/config", () => ({
  getApiBaseUrl: () => "http://192.168.1.5:8000",
}));

const mockGetToken = jest.mocked(getStoredToken);
const mockGetLimits = jest.mocked(getLimits);
const mockGetProfile = jest.mocked(getProfile);
const mockGetGoal = jest.mocked(getCurrentGoal);
const mockGetDay = jest.mocked(getDay);

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
  ]) {
    mock.mockReset();
  }
  mockGetDay.mockResolvedValue(DAY);
  // The survey asks the server for its limits; these tests don't need them.
  mockGetLimits.mockRejectedValue(new ApiError("Could not reach the server."));
});

describe("App", () => {
  it("shows the survey on first launch", async () => {
    mockGetToken.mockResolvedValue(null);
    render(<App />);
    expect(await screen.findByText("Let’s set your targets")).toBeTruthy();
  });

  it("shows today, with calories left, when the survey is already done", async () => {
    mockGetToken.mockResolvedValue("token");
    mockGetProfile.mockResolvedValue(PROFILE);
    mockGetGoal.mockResolvedValue(GOAL);

    render(<App />);

    expect(await screen.findByText("Cooper")).toBeTruthy();
    expect(await screen.findByLabelText("3034 calories left")).toBeTruthy();
  });

  it("opens the targets from today, and goes back", async () => {
    mockGetToken.mockResolvedValue("token");
    mockGetProfile.mockResolvedValue(PROFILE);
    mockGetGoal.mockResolvedValue(GOAL);
    render(<App />);
    await screen.findByText("Cooper");

    fireEvent.press(
      screen.getByRole("button", { name: "My targets and answers" }),
    );
    expect(screen.getByText("Cooper, your daily targets")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Back to today" }));
    expect(await screen.findByText("Cooper")).toBeTruthy();
  });

  it("opens the add-food screen and comes back", async () => {
    mockGetToken.mockResolvedValue("token");
    mockGetProfile.mockResolvedValue(PROFILE);
    mockGetGoal.mockResolvedValue(GOAL);
    render(<App />);
    await screen.findByLabelText("3034 calories left");

    fireEvent.press(screen.getByRole("button", { name: "Add food" }));
    expect(screen.getByLabelText("Search foods")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Cooper")).toBeTruthy();
  });

  it("opens the survey again, filled in, when changing answers", async () => {
    mockGetToken.mockResolvedValue("token");
    mockGetProfile.mockResolvedValue(PROFILE);
    mockGetGoal.mockResolvedValue(GOAL);
    render(<App />);
    await screen.findByText("Cooper");
    fireEvent.press(
      screen.getByRole("button", { name: "My targets and answers" }),
    );

    fireEvent.press(screen.getByRole("button", { name: "Change my answers" }));

    expect(
      screen.getByLabelText("Current weight in kilograms").props.value,
    ).toBe("80");
    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("3034")).toBeTruthy();
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

    expect(await screen.findByText("Cooper")).toBeTruthy();
  });
});
