import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Goal, Profile } from "../../api/endpoints";
import { ApiError } from "../../api/client";
import {
  changeLogEntry,
  deleteLogEntry,
  getDay,
  getMonth,
  getWeek,
  type Day,
  type Month,
  type Week,
} from "../../api/food";
import { deleteWorkout } from "../../api/workouts";
import { HomeScreen } from "./HomeScreen";

jest.mock("../../api/food");
jest.mock("../../api/workouts");

const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const PROFILE = { name: "Cooper" } as Profile;
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
  totals: { calories: 105, protein_g: 1.3, fat_g: 0.4, carb_g: 27 },
  goal_calories: 3034,
  remaining_calories: 2929,
  workouts: [],
  burned: { resting: 1780, workouts: 0, total: 1780 },
  balance_calories: -1780,
};

const mockDay = jest.mocked(getDay);
const mockDelete = jest.mocked(deleteLogEntry);
const mockChange = jest.mocked(changeLogEntry);
const mockWeek = jest.mocked(getWeek);
const mockMonth = jest.mocked(getMonth);

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
  })),
};

const WEEK: Week = {
  end: "2026-10-18",
  days: [12, 13, 14, 15, 16, 17, 18].map((d, i) => ({
    date: `2026-10-${d}`,
    calories: i === 6 ? 2500 : i === 5 ? 3100 : 0,
    protein_g: 0,
    entries: i >= 5 ? 2 : 0,
    workouts: [],
  })),
  goal_calories: 3034,
  average_calories: 2800,
};

beforeEach(() => {
  jest.resetAllMocks();
  mockDay.mockResolvedValue(DAY);
  mockDelete.mockResolvedValue(undefined);
  mockWeek.mockResolvedValue(WEEK);
  mockMonth.mockResolvedValue(MONTH);
});

function renderHome(reloadKey = 0, date: string | null = null) {
  const onDateChange = jest.fn();
  const onAddFood = jest.fn();
  const onAddWorkout = jest.fn();
  const onShowTargets = jest.fn();
  const view = render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <HomeScreen
        profile={PROFILE}
        goal={GOAL}
        reloadKey={reloadKey}
        date={date}
        onDateChange={onDateChange}
        onAddWorkout={onAddWorkout}
        onAddFood={onAddFood}
        onShowTargets={onShowTargets}
      />
    </SafeAreaProvider>,
  );
  return { onAddFood, onAddWorkout, onShowTargets, onDateChange, view };
}

const WORKOUT = {
  id: "w1",
  logged_on: "2026-10-18",
  activity: "walking",
  label: "Walking",
  minutes: 60,
  intensity: "moderate",
  calories: 200,
  calories_typed: false,
};

describe("HomeScreen", () => {
  it("shows calories left, what was eaten and the macros so far", async () => {
    renderHome();
    expect(await screen.findByLabelText("2929 calories left")).toBeTruthy();
    expect(screen.getByText("Eaten 105 kcal of 3034 kcal")).toBeTruthy();
    expect(screen.getByText("Protein 1 / 144 g")).toBeTruthy();
    expect(screen.getByText("Bananas, raw")).toBeTruthy();
    expect(screen.getByText("1 medium · 105 kcal")).toBeTruthy();
  });

  it("shows how far over the target someone is", async () => {
    mockDay.mockResolvedValue({ ...DAY, remaining_calories: -120 });
    renderHome();
    expect(await screen.findByLabelText("120 calories over")).toBeTruthy();
    expect(screen.getByText("calories over your target")).toBeTruthy();
  });

  it("invites the first entry on an empty day", async () => {
    mockDay.mockResolvedValue({
      ...DAY,
      entries: [],
      totals: {},
      remaining_calories: 3034,
    });
    renderHome();
    expect(await screen.findByText(/Nothing yet/)).toBeTruthy();
    expect(screen.getByLabelText("3034 calories left")).toBeTruthy();
  });

  it("removes an entry and reloads today", async () => {
    renderHome();
    fireEvent.press(await screen.findByLabelText("Remove Bananas, raw"));
    await act(async () => {});
    expect(mockDelete).toHaveBeenCalledWith("e1");
    expect(mockDay).toHaveBeenCalledTimes(2);
  });

  it("reloads when something was added", async () => {
    const { view } = renderHome(0);
    await screen.findByLabelText("2929 calories left");
    view.rerender(
      <SafeAreaProvider initialMetrics={PHONE}>
        <HomeScreen
          profile={PROFILE}
          goal={GOAL}
          reloadKey={1}
          date={null}
          onDateChange={jest.fn()}
          onAddWorkout={jest.fn()}
          onAddFood={jest.fn()}
          onShowTargets={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    await act(async () => {});
    expect(mockDay).toHaveBeenCalledTimes(2);
  });

  it("shows an error with a way to try again", async () => {
    mockDay.mockRejectedValueOnce(new ApiError("Could not reach the server."));
    renderHome();
    expect(await screen.findByText("Could not reach the server.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(await screen.findByLabelText("2929 calories left")).toBeTruthy();
  });

  it("opens the add-food and targets screens", async () => {
    const { onAddFood, onShowTargets } = renderHome();
    await screen.findByLabelText("2929 calories left");
    fireEvent.press(screen.getByLabelText("Add food"));
    fireEvent.press(screen.getByLabelText("My targets and answers"));
    expect(onAddFood).toHaveBeenCalled();
    expect(onShowTargets).toHaveBeenCalled();
  });

  it("moves to yesterday with the arrow, and cannot go past today", async () => {
    const { onDateChange } = renderHome();
    await screen.findByLabelText("2929 calories left");
    expect(screen.getByText("Today")).toBeTruthy();
    expect(
      screen.getByLabelText("Next day").props.accessibilityState?.disabled,
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Previous day"));
    expect(onDateChange).toHaveBeenCalledWith("2026-10-17");
  });

  it("shows a past day by name and goes forward to today as null", async () => {
    mockDay.mockResolvedValue({ ...DAY, date: "2026-10-17" });
    const { onDateChange } = renderHome(0, "2026-10-17");
    expect(await screen.findByText("Yesterday")).toBeTruthy();
    expect(mockDay).toHaveBeenCalledWith("2026-10-17");
    expect(screen.getByText("calories left that day")).toBeTruthy();
    expect(screen.getByText("Eaten Yesterday")).toBeTruthy();
    expect(screen.getByLabelText("Add food to Yesterday")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Next day"));
    expect(onDateChange).toHaveBeenCalledWith(null);
  });

  it("changes an entry amount by typing a new one", async () => {
    mockChange.mockResolvedValue(DAY.entries[0]);
    renderHome();
    fireEvent.press(await screen.findByLabelText("Edit Bananas, raw"));
    const box = screen.getByLabelText("New amount for Bananas, raw");
    expect(box.props.value).toBe("1 medium");
    fireEvent.changeText(box, "2 medium");
    fireEvent.press(screen.getByLabelText("Save amount"));
    await act(async () => {});
    expect(mockChange).toHaveBeenCalledWith("e1", "2 medium");
    expect(mockDay).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText("Save amount")).toBeNull();
  });

  it("keeps the editor open and says why when the amount cannot be used", async () => {
    mockChange.mockRejectedValue(
      new ApiError(
        'Try "medium", "large", or grams.',
        422,
        {},
        "unknown_serving",
      ),
    );
    renderHome();
    fireEvent.press(await screen.findByLabelText("Edit Bananas, raw"));
    fireEvent.changeText(
      screen.getByLabelText("New amount for Bananas, raw"),
      "2 slices",
    );
    fireEvent.press(screen.getByLabelText("Save amount"));
    expect(
      await screen.findByText('Try "medium", "large", or grams.'),
    ).toBeTruthy();
    expect(screen.getByLabelText("Save amount")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Cancel"));
    expect(screen.queryByLabelText("Save amount")).toBeNull();
  });

  it("shows the week and opens a tapped day", async () => {
    const { onDateChange } = renderHome();
    await screen.findByLabelText("2929 calories left");
    expect(mockWeek).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("Week view"));
    expect(await screen.findByText(/Average 2800 kcal a day/)).toBeTruthy();
    expect(screen.getByText("2500 kcal")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Open Yesterday"));
    expect(onDateChange).toHaveBeenCalledWith("2026-10-17");
    expect(await screen.findByLabelText("Previous day")).toBeTruthy();
  });

  it("says so when nothing was logged this week", async () => {
    mockWeek.mockResolvedValue({
      ...WEEK,
      average_calories: null,
      days: WEEK.days.map((d) => ({ ...d, calories: 0, entries: 0 })),
    });
    renderHome();
    await screen.findByLabelText("2929 calories left");
    fireEvent.press(screen.getByLabelText("Week view"));
    expect(
      await screen.findByText("Nothing logged this week yet."),
    ).toBeTruthy();
  });

  it("shows a week error with a way to try again", async () => {
    mockWeek.mockRejectedValueOnce(new ApiError("Could not reach the server."));
    renderHome();
    await screen.findByLabelText("2929 calories left");
    fireEvent.press(screen.getByLabelText("Week view"));
    expect(await screen.findByText("Could not reach the server.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(await screen.findByText(/Average 2800 kcal a day/)).toBeTruthy();
  });

  it("shows a tapped calendar day underneath, without leaving the calendar", async () => {
    mockDay.mockImplementation(async (date) => ({
      ...DAY,
      date: date ?? "2026-10-18",
    }));
    const { onDateChange } = renderHome();
    await screen.findByLabelText("2929 calories left");
    fireEvent.press(screen.getByLabelText("Calendar view"));
    expect(await screen.findByText("October 2026")).toBeTruthy();
    // Today is shown first, under the calendar.
    expect(await screen.findByText("Eaten today")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("October 17, 2800 kcal"));
    expect(await screen.findByText("Eaten Yesterday")).toBeTruthy();
    expect(mockDay).toHaveBeenLastCalledWith("2026-10-17");
    expect(screen.getByText("Bananas, raw")).toBeTruthy();
    expect(screen.getByText("Nutrition facts")).toBeTruthy();
    expect(screen.getByLabelText("Calories 105 kcal")).toBeTruthy();
    expect(screen.getByLabelText("Protein 1.3 g")).toBeTruthy();
    expect(screen.getByLabelText("Sodium not listed")).toBeTruthy();
    // The calendar is still there and the Day tab was not changed.
    expect(screen.getByText("October 2026")).toBeTruthy();
    expect(onDateChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Previous day")).toBeNull();
  });

  it("says so when a calendar day has nothing, and shows no nutrition facts", async () => {
    mockDay.mockImplementation(async (date) => ({
      ...DAY,
      date: date ?? "2026-10-18",
      entries: date ? [] : DAY.entries,
      totals: date ? {} : DAY.totals,
    }));
    renderHome();
    await screen.findByLabelText("2929 calories left");
    fireEvent.press(screen.getByLabelText("Calendar view"));
    await screen.findByText("October 2026");
    fireEvent.press(screen.getByLabelText("October 3, nothing logged"));
    expect(
      await screen.findByText("Nothing was logged this day."),
    ).toBeTruthy();
    expect(screen.queryByText("Nutrition facts")).toBeNull();
  });

  it("removing food from a calendar day refreshes the calendar too", async () => {
    renderHome();
    await screen.findByLabelText("2929 calories left");
    fireEvent.press(screen.getByLabelText("Calendar view"));
    await screen.findByText("October 2026");
    const monthLoads = mockMonth.mock.calls.length;
    fireEvent.press(await screen.findByLabelText("Remove Bananas, raw"));
    await act(async () => {});
    expect(mockDelete).toHaveBeenCalledWith("e1");
    expect(mockMonth.mock.calls.length).toBe(monthLoads + 1);
  });

  it("loads another month when the calendar arrows are used", async () => {
    renderHome();
    await screen.findByLabelText("2929 calories left");
    fireEvent.press(screen.getByLabelText("Calendar view"));
    await screen.findByText("October 2026");
    fireEvent.press(screen.getByLabelText("Previous month"));
    await act(async () => {});
    expect(mockMonth).toHaveBeenLastCalledWith("2026-09");
  });

  it("shows a calendar error with a way to try again", async () => {
    mockMonth.mockRejectedValueOnce(
      new ApiError("Could not reach the server."),
    );
    renderHome();
    await screen.findByLabelText("2929 calories left");
    fireEvent.press(screen.getByLabelText("Calendar view"));
    expect(await screen.findByText("Could not reach the server.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(await screen.findByText("October 2026")).toBeTruthy();
  });

  it("puts the amount editor in a panel so the keyboard cannot cover it", async () => {
    renderHome();
    fireEvent.press(await screen.findByLabelText("Edit Bananas, raw"));
    expect(screen.getByLabelText("Save amount")).toBeTruthy();
    expect(
      screen.getByLabelText("New amount for Bananas, raw").props.autoFocus,
    ).toBe(true);
  });

  describe("calories burned", () => {
    it("shows what was burned, the balance and the workouts", async () => {
      mockDay.mockResolvedValue({
        ...DAY,
        workouts: [WORKOUT],
        burned: { resting: 1780, workouts: 200, total: 1980 },
        balance_calories: -1875,
      });
      renderHome();
      expect(await screen.findByText("1,980 kcal")).toBeTruthy();
      expect(
        screen.getByText(/1,780 kcal resting \+ 200 kcal workouts/),
      ).toBeTruthy();
      expect(
        screen.getByText("1,875 kcal deficit (burned more than eaten)"),
      ).toBeTruthy();
      expect(screen.getByText("Walking")).toBeTruthy();
      expect(
        screen.getByText("60 min · moderate · about 200 kcal"),
      ).toBeTruthy();
    });

    it("calls a gain a surplus", async () => {
      mockDay.mockResolvedValue({ ...DAY, balance_calories: 320 });
      renderHome();
      expect(
        await screen.findByText("320 kcal surplus (eaten more than burned)"),
      ).toBeTruthy();
    });

    it("says when the resting burn is not known yet", async () => {
      mockDay.mockResolvedValue({
        ...DAY,
        burned: { resting: null, workouts: 0, total: 0 },
      });
      renderHome();
      expect(
        await screen.findByText(/Resting burn unknown until your profile/),
      ).toBeTruthy();
    });

    it("has an Add workout button that opens the workout screen", async () => {
      const { onAddWorkout } = renderHome();
      fireEvent.press(await screen.findByLabelText("Add workout"));
      expect(onAddWorkout).toHaveBeenCalled();
    });

    it("removes a workout and reloads the day", async () => {
      jest.mocked(deleteWorkout).mockResolvedValue(undefined);
      mockDay.mockResolvedValue({
        ...DAY,
        workouts: [WORKOUT],
        burned: { resting: 1780, workouts: 200, total: 1980 },
      });
      renderHome();
      fireEvent.press(await screen.findByLabelText("Remove Walking workout"));
      await act(async () => {});
      expect(deleteWorkout).toHaveBeenCalledWith("w1");
      expect(mockDay).toHaveBeenCalledTimes(2);
    });
  });
});
