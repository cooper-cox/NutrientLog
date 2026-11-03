import { render, screen } from "@testing-library/react-native";

import { LoadingScreen } from "./LoadingScreen";

describe("LoadingScreen", () => {
  it("only mentions a sleeping server once loading is slow", async () => {
    render(<LoadingScreen slowAfterMs={30} />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText(/Waking the server up/)).toBeNull();
    expect(await screen.findByText(/Waking the server up/)).toBeTruthy();
  });
});
