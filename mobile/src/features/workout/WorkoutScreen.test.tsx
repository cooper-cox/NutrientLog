import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ApiError } from "../../api/client";
import { getDay, getWeek, type Day, type Week } from "../../api/food";
import {
  addWorkout,
  changeWorkout,
  deleteWorkout,
  getActivities,
} from "../../api/workouts";
import { minuteOptions, weekChart, WorkoutScreen } from "./WorkoutScreen";

jest.mock("../../api/food");
jest.mock("../../api/workouts");

const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const WORKOUT = {
  id: "w1",
  logged_on: "2026-10-20",
  activity: "weights",
  label: "Weight training",
  minutes: 45,
  intensity: "hard",
  calories: 250,
  calories_typed: false,
};

const DAY: Day = {
  date: "2026-10-20",
  today: "2026-10-20",
  entries: [],
  totals: {},
  goal_calories: 3034,
  remaining_calories: 3034,
  workouts: [],
  burned: { resting: 1780, workouts: 0, total: 1780 },
  balance_calories: -1780,
};

/** Sunday 10/18 to Saturday 10/24, with today (Tuesday) in the middle. */
const WEEK: Week = {
  end: "2026-10-24",
  days: [18, 19, 20, 21, 22, 23, 24].map((d) => ({
    date: `2026-10-${d}`,
    calories: 0,
    protein_g: 0,
    entries: 0,
    workouts: d === 18 ? ["Lift"] : d === 20 ? ["Lift"] : [],
    workout_minutes: d === 18 ? 60 : d === 20 ? 45 : 0,
  })),
  goal_calories: 3034,
  average_calories: null,
};

const mockActivities = jest.mocked(getActivities);
const mockAdd = jest.mocked(addWorkout);
const mockChange = jest.mocked(changeWorkout);
const mockDay = jest.mocked(getDay);
const mockWeek = jest.mocked(getWeek);

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
    ...WORKOUT,
    activity: "walking",
    label: "Walking",
    minutes: 30,
  });
  mockDay.mockResolvedValue(DAY);
  mockWeek.mockResolvedValue(WEEK);
  jest.mocked(deleteWorkout).mockResolvedValue(undefined);
});

function renderScreen(date: string | null = null) {
  const onPickDay = jest.fn();
  const onCalendar = jest.fn();
  const onChanged = jest.fn();
  const onToday = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <WorkoutScreen
        date={date}
        reloadKey={0}
        onCalendar={onCalendar}
        onToday={onToday}
        onPickDay={onPickDay}
        onChanged={onChanged}
      />
    </SafeAreaProvider>,
  );
  return { onCalendar, onChanged, onToday, onPickDay };
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

describe("weekChart", () => {
  it("sums the week, labels each day with its weekday and mm/dd, and marks the viewed day", () => {
    const chart = weekChart(WEEK, "2026-10-20");
    expect(chart.workouts).toBe(2);
    expect(chart.minutes).toBe(105);
    expect(chart.top).toBe(60);
    expect(chart.bars.map((b) => b.label)).toEqual([
      "Sun\n10/18",
      "Mon\n10/19",
      "Tue\n10/20",
      "Wed\n10/21",
      "Thu\n10/22",
      "Fri\n10/23",
      "Sat\n10/24",
    ]);
    expect(chart.bars[0].fraction).toBe(1);
    expect(chart.bars[1].fraction).toBe(0);
    expect(chart.bars[2]).toEqual({
      label: "Tue\n10/20",
      fraction: 0.75,
      today: true,
      pickable: true,
    });
    // Days that have not happened yet have no bar at all.
    expect(chart.bars[3].fraction).toBeNull();
  });

  it("only greys out days after the real today, even when an earlier day is open", () => {
    // Viewing Monday 10/19 while today is Friday 10/23: Tue to Fri still show their bars.
    const week = {
      ...WEEK,
      days: WEEK.days.map((d) => ({ ...d, workout_minutes: 30 })),
    };
    const chart = weekChart(week, "2026-10-19", "2026-10-23");
    expect(chart.bars[1].today).toBe(true); // Monday is the orange one
    expect(chart.bars[2].fraction).toBe(0.5); // Tuesday is past, so it keeps its bar
    expect(chart.bars[5].fraction).toBe(0.5); // Friday is today
    expect(chart.bars[6].fraction).toBeNull(); // Saturday is in the future
    expect(chart.bars[5].pickable).toBe(true);
    expect(chart.bars[6].pickable).toBe(false);
  });

  it("makes the chart taller in steps of 30 minutes when a day is longer than an hour", () => {
    const week = {
      ...WEEK,
      days: WEEK.days.map((d, i) => ({
        ...d,
        workout_minutes: i === 1 ? 100 : 0,
      })),
    };
    expect(weekChart(week, "2026-10-20").top).toBe(120);
  });

  it("shows empty bars, not NaN, when an older backend sends no workout_minutes", () => {
    const week = {
      ...WEEK,
      days: WEEK.days.map((d) => {
        const { workout_minutes: _gone, ...rest } = d;
        return rest as typeof d;
      }),
    };
    const chart = weekChart(week, "2026-10-20");
    expect(chart.minutes).toBe(0);
    expect(chart.top).toBe(60);
    expect(chart.bars[2].fraction).toBe(0);
  });
});

describe("WorkoutScreen", () => {
  it("shows this week as a chart with the summary", async () => {
    renderScreen();
    expect(await screen.findByText("This week")).toBeTruthy();
    expect(await screen.findByText("2 workouts · 105 min")).toBeTruthy();
    expect(
      screen.getByLabelText("Minutes worked out each day this week"),
    ).toBeTruthy();
    expect(screen.getByText(/Sun/)).toBeTruthy();
    expect(mockWeek).toHaveBeenCalledWith("2026-10-24"); // asks for Saturday, so Sunday is first
  });

  it("offers Back to today only while another day is open", async () => {
    renderScreen();
    await screen.findByText("This week");
    expect(screen.queryByLabelText("Back to today")).toBeNull();
  });

  it("shows Back to today on an earlier day and goes back when pressed", async () => {
    mockDay.mockResolvedValue({ ...DAY, date: "2026-10-19" });
    const { onToday } = renderScreen("2026-10-19");
    fireEvent.press(await screen.findByLabelText("Back to today"));
    expect(onToday).toHaveBeenCalled();
  });

  it("opens a day when its bar is tapped, and today as null", async () => {
    const { onPickDay } = renderScreen();
    fireEvent.press(await screen.findByLabelText("Open Mon 10/19"));
    expect(onPickDay).toHaveBeenLastCalledWith("2026-10-19");
    fireEvent.press(screen.getByLabelText("Open Tue 10/20"));
    expect(onPickDay).toHaveBeenLastCalledWith(null);
    // Days after today cannot be opened.
    expect(screen.queryByLabelText("Open Wed 10/21")).toBeNull();
  });

  it("changes a logged workout: Edit fills the form, Save sends the changes", async () => {
    mockDay.mockResolvedValue({ ...DAY, workouts: [WORKOUT] });
    mockChange.mockResolvedValue({ ...WORKOUT, minutes: 45 });
    const { onChanged } = renderScreen();
    fireEvent.press(await screen.findByLabelText("Edit Weight training"));
    expect(screen.getByText("Edit Weight training")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Calories burned"), "300");
    fireEvent.press(screen.getByLabelText("Save changes"));
    await act(async () => {});
    expect(mockChange).toHaveBeenCalledWith("w1", {
      activity: "weights",
      minutes: 45,
      intensity: "hard",
      calories: 300,
    });
    expect(mockAdd).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
    // The form goes back to adding.
    expect(screen.getByText("Add a workout")).toBeTruthy();
  });

  it("can cancel an edit without saving", async () => {
    mockDay.mockResolvedValue({ ...DAY, workouts: [WORKOUT] });
    renderScreen();
    fireEvent.press(await screen.findByLabelText("Edit Weight training"));
    fireEvent.press(screen.getByLabelText("Cancel"));
    expect(mockChange).not.toHaveBeenCalled();
    expect(screen.getByText("Add a workout")).toBeTruthy();
  });

  it("opens the calendar from the header", async () => {
    const { onCalendar } = renderScreen();
    await screen.findByText("This week");
    fireEvent.press(screen.getByLabelText("Open calendar"));
    expect(onCalendar).toHaveBeenCalled();
  });

  it("describes each intensity in a few words", async () => {
    renderScreen();
    await screen.findByLabelText("Activity");
    expect(screen.getByText("Easy, you could chat")).toBeTruthy();
    expect(screen.getByText("Sweating a little")).toBeTruthy();
    expect(screen.getByText("Heavy breathing, minimal breaks")).toBeTruthy();
  });

  it("labels the calories box as optional", async () => {
    renderScreen();
    await screen.findByLabelText("Activity");
    expect(screen.getByText("Calories burned (if known)")).toBeTruthy();
    expect(screen.getByPlaceholderText("(optional)")).toBeTruthy();
  });

  it("starts on the first activity, 30 minutes, moderate, and adds it to today", async () => {
    const { onChanged } = renderScreen();
    fireEvent.press(await screen.findByLabelText("Add to today"));
    await act(async () => {});
    expect(mockAdd).toHaveBeenCalledWith({
      activity: "walking",
      minutes: 30,
      intensity: "moderate",
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("uses the activity, minutes, intensity and calories that were chosen", async () => {
    renderScreen("2026-10-17");
    await screen.findByLabelText("Activity");
    fireEvent(screen.getByLabelText("Activity"), "valueChange", "running");
    fireEvent(screen.getByLabelText("Minutes"), "valueChange", 45);
    fireEvent.press(screen.getByLabelText("Hard"));
    expect(screen.getByLabelText("Hard").props.accessibilityState.checked).toBe(
      true,
    );
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

  it("will not add while the calories are not a positive number", async () => {
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
    const { onChanged } = renderScreen();
    fireEvent.press(await screen.findByLabelText("Add to today"));
    expect(await screen.findByText(/Finish your profile/)).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
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

  it("lists what was done and removes it with an orange Remove", async () => {
    mockDay.mockResolvedValue({ ...DAY, workouts: [WORKOUT] });
    const { onChanged } = renderScreen();
    expect(
      await screen.findByText("45 min · hard · about 250 kcal"),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Remove Weight training"));
    await act(async () => {});
    expect(deleteWorkout).toHaveBeenCalledWith("w1");
    expect(onChanged).toHaveBeenCalled();
  });

  it("does not say 'about' when the calories were typed in", async () => {
    mockDay.mockResolvedValue({
      ...DAY,
      workouts: [{ ...WORKOUT, calories: 300, calories_typed: true }],
    });
    renderScreen();
    expect(await screen.findByText("45 min · hard · 300 kcal")).toBeTruthy();
  });

  it("says so when nothing was done that day", async () => {
    renderScreen();
    expect(
      await screen.findByText("No workouts logged for this day yet."),
    ).toBeTruthy();
  });
});
