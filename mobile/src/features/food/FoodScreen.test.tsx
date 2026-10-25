import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Goal } from "../../api/endpoints";
import { ApiError } from "../../api/client";
import {
  changeLogEntry,
  deleteLogEntry,
  getDay,
  type Day,
} from "../../api/food";
import { FoodScreen } from "./FoodScreen";

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

const mockDay = jest.mocked(getDay);
const mockDelete = jest.mocked(deleteLogEntry);
const mockChange = jest.mocked(changeLogEntry);

beforeEach(() => {
  jest.resetAllMocks();
  mockDay.mockResolvedValue(DAY);
  mockDelete.mockResolvedValue(undefined);
});

function renderFood(date: string | null = null) {
  const onCalendar = jest.fn();
  const onChanged = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <FoodScreen
        goal={GOAL}
        reloadKey={0}
        date={date}
        onCalendar={onCalendar}
        onChanged={onChanged}
      />
    </SafeAreaProvider>,
  );
  return { onCalendar, onChanged };
}

describe("FoodScreen", () => {
  it("shows what was eaten today with its calories", async () => {
    renderFood();
    expect(await screen.findByText("1 medium · 105 kcal")).toBeTruthy();
    expect(screen.getByText("1 medium · 105 kcal")).toBeTruthy();
    expect(screen.getByText("Eaten today")).toBeTruthy();
    expect(screen.getByText("Adding to Sun, Oct 18")).toBeTruthy();
  });

  it("invites the first entry on an empty day", async () => {
    mockDay.mockResolvedValue({ ...DAY, entries: [], totals: {} });
    renderFood();
    expect(await screen.findByText(/Nothing yet/)).toBeTruthy();
  });

  it("names a past day and adds to it", async () => {
    mockDay.mockResolvedValue({ ...DAY, date: "2026-10-17" });
    renderFood("2026-10-17");
    expect(await screen.findByText("Eaten Yesterday")).toBeTruthy();
    expect(mockDay).toHaveBeenCalledWith("2026-10-17");
    expect(screen.getByText("Adding to Sat, Oct 17")).toBeTruthy();
  });

  it("opens the calendar from the header", async () => {
    const { onCalendar } = renderFood();
    await screen.findByText("1 medium · 105 kcal");
    fireEvent.press(screen.getByLabelText("Open calendar"));
    expect(onCalendar).toHaveBeenCalled();
  });

  it("removes an entry, reloads the day and tells the app", async () => {
    const { onChanged } = renderFood();
    fireEvent.press(await screen.findByLabelText("Remove Bananas, raw"));
    await act(async () => {});
    expect(mockDelete).toHaveBeenCalledWith("e1");
    expect(mockDay).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalled();
  });

  it("changes an entry amount by typing a new one", async () => {
    mockChange.mockResolvedValue(DAY.entries[0]);
    const { onChanged } = renderFood();
    fireEvent.press(await screen.findByLabelText("Edit Bananas, raw"));
    const box = screen.getByLabelText("New amount for Bananas, raw");
    expect(box.props.value).toBe("1 medium");
    fireEvent.changeText(box, "2 medium");
    fireEvent.press(screen.getByLabelText("Save amount"));
    await act(async () => {});
    expect(mockChange).toHaveBeenCalledWith("e1", "2 medium");
    expect(onChanged).toHaveBeenCalled();
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
    renderFood();
    fireEvent.press(await screen.findByLabelText("Edit Bananas, raw"));
    fireEvent.changeText(
      screen.getByLabelText("New amount for Bananas, raw"),
      "2 slices",
    );
    fireEvent.press(screen.getByLabelText("Save amount"));
    expect(
      await screen.findByText('Try "medium", "large", or grams.'),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Cancel"));
    expect(screen.queryByLabelText("Save amount")).toBeNull();
  });

  it("opens the search and comes back with Back", async () => {
    renderFood();
    await screen.findByText("1 medium · 105 kcal");
    fireEvent.press(screen.getByLabelText("Search foods"));
    expect(screen.getByPlaceholderText(/Search, e.g./)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Back"));
    expect(await screen.findByText("Eaten today")).toBeTruthy();
  });

  it("opens the add-by-hand form straight away", async () => {
    renderFood();
    await screen.findByText("1 medium · 105 kcal");
    fireEvent.press(screen.getByLabelText("Add by hand"));
    expect(screen.queryByPlaceholderText(/Search, e.g./)).toBeNull();
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });

  it("shows the barcode button as not ready yet", async () => {
    renderFood();
    await screen.findByText("1 medium · 105 kcal");
    expect(
      screen.getByLabelText("Scan barcode · soon").props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it("swaps to the nutrition facts page and back", async () => {
    renderFood();
    await screen.findByText("1 medium · 105 kcal");
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Swipe left for nutrition facts")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Show nutrition facts"));
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(screen.getByText("Swipe right for your foods")).toBeTruthy();
    expect(screen.getByLabelText("Show Bananas, raw")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Show your foods"));
    expect(screen.getByText("Food")).toBeTruthy();
  });

  it("shows an error with a way to try again", async () => {
    mockDay.mockRejectedValueOnce(new ApiError("Could not reach the server."));
    renderFood();
    expect(await screen.findByText("Could not reach the server.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(await screen.findByText("1 medium · 105 kcal")).toBeTruthy();
  });
});
