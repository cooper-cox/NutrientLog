import { fireEvent, render, screen } from "@testing-library/react-native";

import { WeekBars } from "./WeekBars";

const BARS = [
  { label: "S", fraction: 0.5, pickable: true },
  { label: "M", fraction: 1, pickable: true },
  { label: "T", fraction: null, pickable: false },
];

describe("WeekBars", () => {
  it("calls onPick with the number of a tapped, pickable bar", () => {
    const onPick = jest.fn();
    render(<WeekBars bars={BARS} onPick={onPick} accessibilityLabel="Week" />);
    fireEvent.press(screen.getByLabelText("Open M"));
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("does not offer bars that cannot be opened", () => {
    render(
      <WeekBars bars={BARS} onPick={jest.fn()} accessibilityLabel="Week" />,
    );
    expect(screen.queryByLabelText("Open T")).toBeNull();
  });

  it("is a plain picture when nothing can be picked", () => {
    render(<WeekBars bars={BARS} accessibilityLabel="Week" />);
    expect(screen.getByLabelText("Week")).toBeTruthy();
    expect(screen.queryByLabelText("Open M")).toBeNull();
  });
});
