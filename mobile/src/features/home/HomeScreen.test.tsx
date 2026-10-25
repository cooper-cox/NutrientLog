import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Goal } from "../../api/endpoints";
import { ApiError } from "../../api/client";
import { getDay, getWeek, type Day, type Week } from "../../api/food";
import { HomeScreen } from "./HomeScreen";

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
  totals: { calories: 105, protein_g: 1.3, fat_g: 0.4, carb_g: 27 },
  goal_calories: 3034,
  remaining_calories: 2929,
  workouts: [],
  burned: { resting: 1780, workouts: 0, total: 1780 },
  balance_calories: -1780,
};

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

const mockDay = jest.mocked(getDay);
const mockWeek = jest.mocked(getWeek);

const WEEK: Week = {
  end: "2026-10-24",
  days: [18, 19, 20, 21, 22, 23, 24].map((d, i) => ({
    date: `2026-10-${d}`,
    calories: i === 0 ? 2500 : 0,
    protein_g: 0,
    entries: i === 0 ? 2 : 0,
    workouts: [],
    workout_minutes: 0,
  })),
  goal_calories: 3034,
  average_calories: 2800,
};

beforeEach(() => {
  jest.resetAllMocks();
  mockDay.mockResolvedValue(DAY);
  mockWeek.mockResolvedValue(WEEK);
});

function Home({
  reloadKey = 0,
  date = null,
  onCalendar = jest.fn(),
  onPickDay,
}: {
  reloadKey?: number;
  date?: string | null;
  onCalendar?: () => void;
  onPickDay?: (date: string | null) => void;
}) {
  return (
    <SafeAreaProvider initialMetrics={PHONE}>
      <HomeScreen
        goal={GOAL}
        reloadKey={reloadKey}
        date={date}
        onCalendar={onCalendar}
        onPickDay={onPickDay}
      />
    </SafeAreaProvider>
  );
}

describe("HomeScreen", () => {
  it("shows calories left, what was eaten and the macros so far", async () => {
    render(<Home />);
    expect(await screen.findByLabelText("2929 calories left")).toBeTruthy();
    expect(screen.getByText("calories left")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Eaten 105 kcal")).toBeTruthy();
    expect(screen.getByText("3,034 kcal target")).toBeTruthy();
    expect(screen.getByText("Protein")).toBeTruthy();
    expect(screen.getByText("1 / 144 g")).toBeTruthy();
    expect(screen.getByText("Macros today")).toBeTruthy();
  });

  it("shows this week, Sunday to Saturday, with the average", async () => {
    render(<Home />);
    await screen.findByLabelText("2929 calories left");
    expect(screen.getByText("This week")).toBeTruthy();
    expect(await screen.findByText("avg 2800 kcal")).toBeTruthy();
    expect(
      screen.getByLabelText(/Calories eaten each day of this week/),
    ).toBeTruthy();
  });

  it("keeps the week fixed and only asks for it once the day is known", async () => {
    render(<Home />);
    await screen.findByLabelText("2929 calories left");
    expect(mockWeek).toHaveBeenLastCalledWith("2026-10-24");
    expect(screen.getByText("Sun\n10/18")).toBeTruthy();
    expect(screen.getByText("Sat\n10/24")).toBeTruthy();
  });

  it("taps a day with no bar, by its label", async () => {
    const onPickDay = jest.fn();
    render(<Home onPickDay={onPickDay} />);
    await screen.findByLabelText("2929 calories left");
    expect(screen.queryByLabelText("Open Sat 10/24")).toBeNull();
    await screen.findByText("avg 2800 kcal");
    fireEvent.press(screen.getByLabelText("Open Sun 10/18"));
    expect(onPickDay).toHaveBeenCalledWith(null);
  });

  it("shows how far over the target someone is", async () => {
    mockDay.mockResolvedValue({ ...DAY, remaining_calories: -120 });
    render(<Home />);
    expect(await screen.findByLabelText("120 calories over")).toBeTruthy();
    expect(screen.getByText("calories over")).toBeTruthy();
  });

  it("shows a full bar and no entries on an empty day", async () => {
    mockDay.mockResolvedValue({
      ...DAY,
      entries: [],
      totals: {},
      remaining_calories: 3034,
    });
    render(<Home />);
    expect(await screen.findByLabelText("3034 calories left")).toBeTruthy();
    expect(screen.getByText("Eaten 0 kcal")).toBeTruthy();
  });

  it("asks for a profile when there is no calorie target yet", async () => {
    mockDay.mockResolvedValue({ ...DAY, remaining_calories: null });
    render(<Home />);
    expect(
      await screen.findByText("Set up your targets to see calories left."),
    ).toBeTruthy();
  });

  it("reloads when something changed", async () => {
    const view = render(<Home reloadKey={0} />);
    await screen.findByLabelText("2929 calories left");
    view.rerender(<Home reloadKey={1} />);
    await act(async () => {});
    expect(mockDay).toHaveBeenCalledTimes(2);
  });

  it("shows an error with a way to try again", async () => {
    mockDay.mockRejectedValueOnce(new ApiError("Could not reach the server."));
    render(<Home />);
    expect(await screen.findByText("Could not reach the server.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(await screen.findByLabelText("2929 calories left")).toBeTruthy();
  });

  it("opens the calendar from the button in the header", async () => {
    const onCalendar = jest.fn();
    render(<Home onCalendar={onCalendar} />);
    await screen.findByLabelText("2929 calories left");
    fireEvent.press(screen.getByLabelText("Open calendar"));
    expect(onCalendar).toHaveBeenCalled();
  });

  it("shows a past day by name", async () => {
    mockDay.mockResolvedValue({ ...DAY, date: "2026-10-17" });
    render(<Home date="2026-10-17" />);
    expect(await screen.findByText("Yesterday")).toBeTruthy();
    expect(mockDay).toHaveBeenCalledWith("2026-10-17");
    expect(screen.getByText("calories left that day")).toBeTruthy();
    expect(screen.getByText("Macros")).toBeTruthy();
  });

  describe("calories burned", () => {
    it("shows what was burned and the balance", async () => {
      mockDay.mockResolvedValue({
        ...DAY,
        workouts: [WORKOUT],
        burned: { resting: 1780, workouts: 200, total: 1980 },
        balance_calories: -1875,
      });
      render(<Home />);
      expect(await screen.findByText("1,980 kcal")).toBeTruthy();
      expect(
        screen.getByText(/1,780 kcal resting \+ 200 kcal workouts/),
      ).toBeTruthy();
      expect(
        screen.getByText("1,875 kcal deficit (burned more than eaten)"),
      ).toBeTruthy();
    });

    it("calls a gain a surplus", async () => {
      mockDay.mockResolvedValue({ ...DAY, balance_calories: 320 });
      render(<Home />);
      expect(
        await screen.findByText("320 kcal surplus (eaten more than burned)"),
      ).toBeTruthy();
    });

    it("says when the resting burn is not known yet", async () => {
      mockDay.mockResolvedValue({
        ...DAY,
        burned: { resting: null, workouts: 0, total: 0 },
      });
      render(<Home />);
      expect(
        await screen.findByText(/Resting burn unknown until your profile/),
      ).toBeTruthy();
    });
  });
});
