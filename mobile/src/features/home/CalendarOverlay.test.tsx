import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Goal } from "../../api/endpoints";
import { ApiError } from "../../api/client";
import { getDay, getMonth, type Day, type Month } from "../../api/food";
import { CalendarOverlay } from "./CalendarOverlay";

jest.mock("../../api/food");
jest.mock("../../api/workouts");

const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const GOAL = { calories: 3034, protein_g: 144, fat_g: 84, carb_g: 425 } as Goal;

const DAY: Day = {
  date: "2026-10-18",
  today: "2026-10-18",
  entries: [
    {
      id: "e1",
      food_id: "f1",
      food_name: "Bananas, raw",
      brand: null,
      logged_on: "2026-10-18",
      grams: 118,
      amount_text: "1 medium",
      nutrients: { calories: 105 },
    },
  ],
  totals: {
    calories: 105,
    protein_g: 1.3,
    fat_g: 0.4,
    carb_g: 27,
    fiber_g: 3.1,
  },
  goal_calories: 3034,
  remaining_calories: 2929,
  workouts: [
    {
      id: "w1",
      logged_on: "2026-10-18",
      activity: "weights",
      label: "Weights",
      minutes: 45,
      intensity: "hard",
      calories: 250,
      calories_typed: false,
    },
  ],
  burned: { resting: 1780, workouts: 250, total: 2030 },
  balance_calories: -1925,
};

const MONTH: Month = {
  month: "2026-10",
  today: "2026-10-18",
  goal_calories: 3034,
  average_calories: 2800,
  days: Array.from({ length: 31 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    calories: i === 16 ? 2800 : 0,
    protein_g: 0,
    entries: i === 16 ? 1 : 0,
    workouts: [],
    workout_minutes: 0,
  })),
};

const mockDay = jest.mocked(getDay);
const mockMonth = jest.mocked(getMonth);

beforeEach(() => {
  jest.resetAllMocks();
  mockDay.mockImplementation(async (date) => ({
    ...DAY,
    date: date ?? DAY.date,
  }));
  mockMonth.mockResolvedValue(MONTH);
});

function open(selected: string | null = null) {
  const onPick = jest.fn();
  const onClose = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <CalendarOverlay
        reloadKey={0}
        goal={GOAL}
        selected={selected}
        onPick={onPick}
        onClose={onClose}
      />
    </SafeAreaProvider>,
  );
  return { onPick, onClose };
}

describe("CalendarOverlay", () => {
  it("shows the month and a one-line summary of the open day", async () => {
    open();
    expect(await screen.findByText("October 2026")).toBeTruthy();
    expect(await screen.findByText("Today, Sun, Oct 18")).toBeTruthy();
    expect(screen.getByText("105 kcal eaten · Weights 45 min")).toBeTruthy();
    // The details stay folded until More is pressed.
    expect(screen.queryByText("Nutrients")).toBeNull();
  });

  it("unfolds the foods, macros and nutrients with More, and folds them with Less", async () => {
    open();
    fireEvent.press(await screen.findByLabelText("More about this day"));
    expect(screen.getByText("Bananas, raw")).toBeTruthy();
    expect(screen.getByText("Macros")).toBeTruthy();
    expect(screen.getByLabelText("Fiber 3.1 g")).toBeTruthy();
    expect(screen.getByLabelText("Sodium not listed")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Show less"));
    expect(screen.queryByText("Nutrients")).toBeNull();
  });

  it("says so when the open day has no food", async () => {
    mockDay.mockResolvedValue({ ...DAY, entries: [], totals: {} });
    open();
    fireEvent.press(await screen.findByLabelText("More about this day"));
    expect(screen.getByText("Nothing was logged this day.")).toBeTruthy();
    expect(screen.queryByText("Nutrients")).toBeNull();
  });

  it("picks a tapped day, and today as null", async () => {
    const { onPick } = open();
    await screen.findByText("October 2026");
    fireEvent.press(screen.getByLabelText("October 17, 2800 kcal"));
    expect(onPick).toHaveBeenLastCalledWith("2026-10-17");
    fireEvent.press(screen.getByLabelText("October 18, nothing logged"));
    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it("loads another month with the arrows", async () => {
    open();
    await screen.findByText("October 2026");
    fireEvent.press(screen.getByLabelText("Previous month"));
    await act(async () => {});
    expect(mockMonth).toHaveBeenLastCalledWith("2026-09");
  });

  it("closes with the Close button and with the faded background", async () => {
    const { onClose } = open();
    await screen.findByText("October 2026");
    fireEvent.press(screen.getByLabelText("Close calendar"));
    fireEvent.press(screen.getByLabelText("Close calendar background"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows a calendar error with a way to try again", async () => {
    mockMonth.mockRejectedValueOnce(
      new ApiError("Could not reach the server."),
    );
    open();
    expect(await screen.findByText("Could not reach the server.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(await screen.findByText("October 2026")).toBeTruthy();
  });
});
