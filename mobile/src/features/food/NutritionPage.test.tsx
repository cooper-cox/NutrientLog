import { fireEvent, render, screen } from "@testing-library/react-native";

import type { Goal } from "../../api/endpoints";
import type { Day } from "../../api/food";
import { NutritionPage, shares } from "./NutritionPage";

const GOAL = { calories: 3034, protein_g: 144, fat_g: 84, carb_g: 425 } as Goal;

const DAY: Day = {
  date: "2026-10-20",
  today: "2026-10-20",
  entries: [
    {
      id: "e1",
      food_id: "f1",
      food_name: "Greek yogurt",
      brand: null,
      logged_on: "2026-10-20",
      grams: 170,
      amount_text: "1 container",
      nutrients: { calories: 100, protein_g: 17, iron_mg: 0 },
    },
    {
      id: "e2",
      food_id: "f2",
      food_name: "Chicken and rice",
      brand: null,
      logged_on: "2026-10-20",
      grams: 400,
      amount_text: "1 plate",
      nutrients: { calories: 780, protein_g: 52, fat_g: 18 },
    },
  ],
  totals: { calories: 880, protein_g: 69, fat_g: 18, iron_mg: 3 },
  goal_calories: 3034,
  remaining_calories: 2154,
  workouts: [],
  burned: { resting: 1780, workouts: 0, total: 1780 },
  balance_calories: -900,
};

describe("shares", () => {
  it("splits a bar against the target into the chosen food and the rest", () => {
    expect(shares(100, 25, 200)).toEqual({ other: 0.375, pick: 0.125 });
  });

  it("uses the day's total as the whole when there is no target", () => {
    expect(shares(10, 4, undefined)).toEqual({ other: 0.6, pick: 0.4 });
  });

  it("keeps the bar within its track when the target is passed", () => {
    expect(shares(300, 100, 200)).toEqual({ other: 200 / 300, pick: 1 / 3 });
  });

  it("is empty when nothing was eaten", () => {
    expect(shares(0, 0, 100)).toEqual({ other: 0, pick: 0 });
    expect(shares(0, 0, undefined)).toEqual({ other: 0, pick: 0 });
  });
});

describe("NutritionPage", () => {
  it("lists the day's nutrients against the targets that exist", () => {
    render(<NutritionPage day={DAY} goal={GOAL} />);
    expect(screen.getByText("880 / 3,034 kcal")).toBeTruthy();
    expect(screen.getByText("69 / 144 g")).toBeTruthy();
    // No target is known for iron, so only the total shows.
    expect(screen.getByText("3 mg")).toBeTruthy();
    expect(screen.getByText("Vitamin D")).toBeTruthy();
  });

  it("starts on the first food and shows its share of each nutrient", () => {
    render(<NutritionPage day={DAY} goal={GOAL} />);
    expect(
      screen.getByLabelText("Show Greek yogurt").props.accessibilityState
        .selected,
    ).toBe(true);
    expect(screen.getAllByText("100 kcal from this food (11%)").length).toBe(1);
    expect(screen.getAllByText("17 g from this food (25%)").length).toBe(1);
  });

  it("switches to another food when it is tapped", () => {
    render(<NutritionPage day={DAY} goal={GOAL} />);
    fireEvent.press(screen.getByLabelText("Show Chicken and rice"));
    expect(screen.getByText("780 kcal from this food (89%)")).toBeTruthy();
    expect(screen.getByText("52 g from this food (75%)")).toBeTruthy();
    expect(
      screen.getByLabelText("Show Chicken and rice").props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it("says when a food has none of a nutrient or does not list it", () => {
    render(<NutritionPage day={DAY} goal={GOAL} />);
    expect(screen.getByText("none from this food")).toBeTruthy(); // iron 0
    expect(
      screen.getAllByText("not listed for this food").length,
    ).toBeGreaterThan(0);
  });

  it("says so when nothing was eaten", () => {
    render(
      <NutritionPage day={{ ...DAY, entries: [], totals: {} }} goal={GOAL} />,
    );
    expect(screen.getByText("Nothing logged yet.")).toBeTruthy();
    expect(
      screen.getAllByText("Tap a food to see its share").length,
    ).toBeGreaterThan(0);
  });
});
