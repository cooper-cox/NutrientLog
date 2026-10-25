import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Goal, Profile } from "../../api/endpoints";
import { Alert } from "react-native";

import { ageOn, ProfileScreen } from "./ProfileScreen";

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
  goal_weight_kg: 85,
  activity_level: "moderate",
  goal_type: "gain",
  rate_kg_per_week: 0.25,
  timezone: "UTC",
  unit_preference: "metric",
  updated_at: "2026-10-10T00:00:00Z",
};

const GOAL: Goal = {
  effective_from: "2026-10-10",
  calories: 3034,
  protein_g: 144,
  fat_g: 84,
  carb_g: 425,
  weight_kg: 80,
  bmr: 1780,
  tdee: 2759,
  daily_adjustment: 275,
  rate_kg_per_week: 0.25,
  rate_was_capped: false,
  floor_was_applied: false,
  weeks_to_goal: 20,
};

function renderProfile(
  profile: Profile = PROFILE,
  goal: Goal = GOAL,
  onStartOver?: () => void,
) {
  const onChangeAnswers = jest.fn();
  const onCheckConnection = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <ProfileScreen
        profile={profile}
        goal={goal}
        onChangeAnswers={onChangeAnswers}
        onCheckConnection={onCheckConnection}
        onStartOver={onStartOver}
      />
    </SafeAreaProvider>,
  );
  return { onChangeAnswers, onCheckConnection };
}

describe("ageOn", () => {
  it("counts whole years and waits for the birthday", () => {
    expect(ageOn("1996-10-08", new Date(2026, 9, 7))).toBe(29);
    expect(ageOn("1996-10-08", new Date(2026, 9, 8))).toBe(30);
    expect(ageOn("1996-10-08", new Date(2026, 11, 31))).toBe(30);
    expect(ageOn("1996-10-08", new Date(2026, 0, 1))).toBe(29);
  });
});

describe("ProfileScreen", () => {
  it("has no Check connection button in the released app (no handler given)", () => {
    render(
      <SafeAreaProvider initialMetrics={PHONE}>
        <ProfileScreen
          profile={PROFILE}
          goal={GOAL}
          onChangeAnswers={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(screen.queryByLabelText("Check connection")).toBeNull();
    expect(screen.getByLabelText("Edit my answers")).toBeTruthy();
  });

  it("has no Start over button unless the app is in testing mode", () => {
    renderProfile();
    expect(screen.queryByLabelText("Start over (testing)")).toBeNull();
  });

  it("asks before starting over, then calls onStartOver", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const onStartOver = jest.fn();
    renderProfile(PROFILE, GOAL, onStartOver);
    fireEvent.press(screen.getByLabelText("Start over (testing)"));
    expect(onStartOver).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] ?? [];
    buttons.find((b) => b.text === "Start over")?.onPress?.();
    expect(onStartOver).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it("shows the calorie goal, what it is for and the macros on one line", () => {
    renderProfile();
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.getByLabelText("3034 calories per day")).toBeTruthy();
    expect(screen.getByText(/calories a day/)).toBeTruthy();
    expect(screen.getByText(/to gain weight/)).toBeTruthy();
    expect(
      screen.getByText(/Gain 0.25 kg per week · resting burn 1,780 kcal/),
    ).toBeTruthy();
    expect(screen.getByText("144 g")).toBeTruthy();
    expect(screen.getByText("84 g")).toBeTruthy();
    expect(screen.getByText("425 g")).toBeTruthy();
  });

  it("lists what the person told us", () => {
    renderProfile();
    expect(screen.getByText("80 kg")).toBeTruthy();
    expect(screen.getByText("180 cm")).toBeTruthy();
    expect(screen.getByText("Moderately active")).toBeTruthy();
    expect(screen.getByText("Gain weight")).toBeTruthy();
  });

  it("shows height and weight in feet and pounds for imperial users", () => {
    renderProfile({ ...PROFILE, unit_preference: "imperial" });
    expect(screen.getByText("176.4 lb")).toBeTruthy();
    expect(screen.getByText("5 ft 11 in")).toBeTruthy();
  });

  it("explains how the numbers were set only after Details is pressed", () => {
    renderProfile();
    expect(screen.queryByText(/burns about 1780 calories/)).toBeNull();
    fireEvent.press(
      screen.getByLabelText("Details: how these numbers were set"),
    );
    expect(
      screen.getByText(/burns about 1780 calories a day at rest/),
    ).toBeTruthy();
    expect(
      screen.getByText(/we add 275 calories \(\+275 a day\)/),
    ).toBeTruthy();
    expect(screen.getByText(/would take about 20 weeks/)).toBeTruthy();
    expect(screen.getAllByText(/not medical advice/i).length).toBe(2); // the footer and the full note
    fireEvent.press(screen.getByLabelText("Hide details"));
    expect(screen.queryByText(/burns about 1780 calories/)).toBeNull();
  });

  it("tells the person when their pace or target was adjusted", () => {
    renderProfile(PROFILE, {
      ...GOAL,
      rate_was_capped: true,
      floor_was_applied: true,
    });
    fireEvent.press(
      screen.getByLabelText("Details: how these numbers were set"),
    );
    expect(screen.getByText(/faster than we consider safe/)).toBeTruthy();
    expect(screen.getByText(/lowest daily amount we recommend/)).toBeTruthy();
  });

  it("says nothing is added or removed when staying the same", () => {
    renderProfile(
      {
        ...PROFILE,
        goal_type: "maintain",
        goal_weight_kg: null,
        rate_kg_per_week: 0,
      },
      {
        ...GOAL,
        rate_kg_per_week: 0,
        daily_adjustment: 0,
        weeks_to_goal: null,
      },
    );
    expect(screen.getByText(/to stay the same/)).toBeTruthy();
    expect(screen.getByText(/Staying where you are/)).toBeTruthy();
    fireEvent.press(
      screen.getByLabelText("Details: how these numbers were set"),
    );
    expect(screen.getByText(/nothing is added or removed/)).toBeTruthy();
  });

  it("opens the survey from Edit and Edit my answers, and the connection check", () => {
    const { onChangeAnswers, onCheckConnection } = renderProfile();
    fireEvent.press(screen.getByLabelText("Edit your goal"));
    fireEvent.press(screen.getByLabelText("Edit about you"));
    fireEvent.press(screen.getByLabelText("Edit my answers"));
    expect(onChangeAnswers).toHaveBeenCalledTimes(3);
    fireEvent.press(screen.getByLabelText("Check connection"));
    expect(onCheckConnection).toHaveBeenCalled();
  });
});
