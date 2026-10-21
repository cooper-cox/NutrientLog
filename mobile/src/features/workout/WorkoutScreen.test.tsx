import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ApiError } from "../../api/client";
import { addWorkout, getActivities } from "../../api/workouts";
import { minuteOptions, WorkoutScreen } from "./WorkoutScreen";

jest.mock("../../api/workouts");

const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mockActivities = jest.mocked(getActivities);
const mockAdd = jest.mocked(addWorkout);

beforeEach(() => {
  jest.resetAllMocks();
  mockActivities.mockResolvedValue({
    activities: [
      { key: "walking", label: "Walking" },
      { key: "running", label: "Running" },
    ],
    intensities: ["light", "moderate", "hard"],
    max_minutes: 600,
  });
  mockAdd.mockResolvedValue({
    id: "w1",
    logged_on: "2026-10-18",
    activity: "walking",
    label: "Walking",
    minutes: 30,
    intensity: "moderate",
    calories: 100,
    calories_typed: false,
  });
});

function renderScreen(date: string | null = null) {
  const onAdded = jest.fn();
  const onBack = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <WorkoutScreen date={date} onAdded={onAdded} onBack={onBack} />
    </SafeAreaProvider>,
  );
  return { onAdded, onBack };
}

describe("minuteOptions", () => {
  it("steps by 5, then 15, then 30 and stops at the limit", () => {
    const options = minuteOptions(600);
    expect(options.slice(0, 3)).toEqual([5, 10, 15]);
    expect(options).toContain(120);
    expect(options).toContain(135);
    expect(options).toContain(240);
    expect(options).toContain(270);
    expect(options[options.length - 1]).toBe(600);
    expect(options).not.toContain(125);
    expect(minuteOptions(30)).toEqual([5, 10, 15, 20, 25, 30]);
  });
});

describe("WorkoutScreen", () => {
  it("starts on the first activity, 30 minutes, moderate, and adds it to today", async () => {
    const { onAdded } = renderScreen();
    fireEvent.press(await screen.findByLabelText("Add to today"));
    await act(async () => {});
    expect(mockAdd).toHaveBeenCalledWith({
      activity: "walking",
      minutes: 30,
      intensity: "moderate",
    });
    expect(onAdded).toHaveBeenCalled();
  });

  it("uses the activity, minutes, intensity and watch calories that were chosen", async () => {
    renderScreen("2026-10-17");
    await screen.findByLabelText("Activity");
    fireEvent(screen.getByLabelText("Activity"), "valueChange", "running");
    fireEvent(screen.getByLabelText("Minutes"), "valueChange", 45);
    fireEvent.press(screen.getByLabelText("Hard"));
    fireEvent.changeText(screen.getByLabelText("Calories burned"), "410,5");
    fireEvent.press(screen.getByLabelText(/^Add to /));
    await act(async () => {});
    expect(mockAdd).toHaveBeenCalledWith({
      activity: "running",
      minutes: 45,
      intensity: "hard",
      calories: 410.5,
      loggedOn: "2026-10-17",
    });
  });

  it("will not add while the watch calories are not a positive number", async () => {
    renderScreen();
    await screen.findByLabelText("Activity");
    fireEvent.changeText(screen.getByLabelText("Calories burned"), "abc");
    expect(screen.getByText(/Enter a number above 0/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Add to today"));
    expect(mockAdd).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText("Calories burned"), "");
    expect(screen.queryByText(/Enter a number above 0/)).toBeNull();
  });

  it("shows why a workout was refused and stays on the screen", async () => {
    mockAdd.mockRejectedValue(
      new ApiError("Finish your profile so calories can be estimated.", 422),
    );
    const { onAdded } = renderScreen();
    fireEvent.press(await screen.findByLabelText("Add to today"));
    expect(await screen.findByText(/Finish your profile/)).toBeTruthy();
    expect(onAdded).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Add to today")).toBeTruthy();
  });

  it("offers another try when the activities cannot be loaded", async () => {
    mockActivities.mockRejectedValueOnce(
      new ApiError("Could not reach the server."),
    );
    renderScreen();
    expect(await screen.findByText("Could not reach the server.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(await screen.findByLabelText("Activity")).toBeTruthy();
    expect(mockActivities).toHaveBeenCalledTimes(2);
  });

  it("goes back without adding", async () => {
    const { onBack } = renderScreen();
    await screen.findByLabelText("Activity");
    fireEvent.press(screen.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
