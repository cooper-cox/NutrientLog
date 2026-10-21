import { fireEvent, render, screen } from "@testing-library/react-native";

import type { Month } from "../../api/food";
import { CalendarView } from "./CalendarView";

function october(): Month {
  return {
    month: "2026-10",
    today: "2026-10-18",
    goal_calories: 3000,
    average_calories: 2500,
    days: Array.from({ length: 31 }, (_, i) => {
      const day = i + 1;
      return {
        date: `2026-10-${String(day).padStart(2, "0")}`,
        calories: day === 17 ? 3200 : day === 16 ? 2000 : 0,
        protein_g: 0,
        entries: day === 17 || day === 16 ? 2 : 0,
        workouts: day === 16 ? ["Run", "Lift"] : day === 14 ? ["Walk"] : [],
      };
    }),
  };
}

function show(month: Month, selected: string | null = null) {
  const onPickDay = jest.fn();
  const onMonthChange = jest.fn();
  render(
    <CalendarView
      month={month}
      selected={selected}
      onPickDay={onPickDay}
      onMonthChange={onMonthChange}
    />,
  );
  return { onPickDay, onMonthChange };
}

describe("CalendarView", () => {
  it("shows the month name and one button per day", () => {
    show(october());
    expect(screen.getByText("October 2026")).toBeTruthy();
    expect(screen.getByLabelText("October 1, nothing logged")).toBeTruthy();
    expect(screen.getByLabelText("October 31, nothing logged")).toBeTruthy();
    expect(
      screen.getByLabelText("October 16, 2000 kcal, workout: Run, Lift"),
    ).toBeTruthy();
  });

  it("opens a tapped day, including one with nothing logged", () => {
    const { onPickDay } = show(october());
    fireEvent.press(screen.getByLabelText("October 17, 3200 kcal"));
    expect(onPickDay).toHaveBeenLastCalledWith("2026-10-17");
    fireEvent.press(screen.getByLabelText("October 3, nothing logged"));
    expect(onPickDay).toHaveBeenLastCalledWith("2026-10-03");
  });

  it("does not open days that have not happened yet", () => {
    const { onPickDay } = show(october());
    fireEvent.press(screen.getByLabelText("October 25, nothing logged"));
    expect(onPickDay).not.toHaveBeenCalled();
  });

  it("goes back a month, and cannot go past the current one", () => {
    const { onMonthChange } = show(october());
    fireEvent.press(screen.getByLabelText("Previous month"));
    expect(onMonthChange).toHaveBeenCalledWith("2026-09");
    fireEvent.press(screen.getByLabelText("Next month"));
    expect(onMonthChange).toHaveBeenCalledTimes(1);
  });

  it("goes forward from an earlier month", () => {
    const september: Month = {
      ...october(),
      month: "2026-09",
      days: october()
        .days.slice(0, 30)
        .map((d) => ({
          ...d,
          date: d.date.replace("-10-", "-09-"),
          calories: 0,
          entries: 0,
          workouts: [],
        })),
      average_calories: null,
    };
    const { onMonthChange } = show(september);
    fireEvent.press(screen.getByLabelText("Next month"));
    expect(onMonthChange).toHaveBeenCalledWith("2026-10");
    expect(screen.getByText("Nothing logged this month yet.")).toBeTruthy();
    // Every day of an earlier month can be opened.
    expect(screen.getByLabelText("September 30, nothing logged")).toBeTruthy();
  });

  it("shows what workout was done under the day, even with no food logged", () => {
    show(october());
    expect(screen.getByText("Walk")).toBeTruthy(); // the 14th: no food, a walk
    expect(screen.getByText("Run +1")).toBeTruthy(); // the 16th: two workouts
    expect(
      screen.getByLabelText("October 14, nothing logged, workout: Walk"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("October 16, 2000 kcal, workout: Run, Lift"),
    ).toBeTruthy();
    expect(screen.queryByText("Lift")).toBeNull();
  });

  it("counts the days worked out this month", () => {
    show(october());
    expect(screen.getByText("Worked out 2 days this month")).toBeTruthy();
  });

  it("says so when there were no workouts", () => {
    const month = october();
    show({ ...month, days: month.days.map((d) => ({ ...d, workouts: [] })) });
    expect(screen.getByText("No workouts logged this month.")).toBeTruthy();
  });

  it("explains the colours and shows the average", () => {
    show(october());
    expect(screen.getByText(/Average 2500 kcal a day/)).toBeTruthy();
    expect(
      screen.getByText(/Green: reached your target \(3000 kcal\)/),
    ).toBeTruthy();
  });
});
