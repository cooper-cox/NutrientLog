import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Goal, Profile } from "../../api/endpoints";
import { WelcomeScreen } from "./WelcomeScreen";

const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const PROFILE: Profile = {
  name: "Cooper",
  sex: "male",
  birth_date: "1996-10-08",
  height_cm: 180,
  weight_kg: 80,
  activity_level: "moderate",
  goal_type: "gain",
  goal_weight_kg: 85,
  rate_kg_per_week: 0.25,
  unit_preference: "metric",
} as Profile;

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

function renderWelcome(profile: Profile = PROFILE) {
  const onStart = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <WelcomeScreen profile={profile} goal={GOAL} onStart={onStart} />
    </SafeAreaProvider>,
  );
  return { onStart };
}

describe("WelcomeScreen", () => {
  it("greets by name and shows the calorie target and macros", () => {
    renderWelcome();
    expect(screen.getByText("Welcome, Cooper")).toBeTruthy();
    expect(screen.getByLabelText("3034 calories per day")).toBeTruthy();
    expect(screen.getByText(/to gain weight/)).toBeTruthy();
    expect(screen.getByText("144 g")).toBeTruthy();
    expect(screen.getByText("84 g")).toBeTruthy();
    expect(screen.getByText("425 g")).toBeTruthy();
  });

  it("explains where the numbers come from", () => {
    renderWelcome();
    expect(
      screen.getByText(/Your body burns about 1780 calories/),
    ).toBeTruthy();
    expect(screen.getByText(/Protein is set from your weight/)).toBeTruthy();
  });

  it("works without a name and starts the app on the button", () => {
    const { onStart } = renderWelcome({ ...PROFILE, name: null });
    expect(screen.getByText("Welcome")).toBeTruthy();
    fireEvent.press(screen.getByText("Start tracking"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
