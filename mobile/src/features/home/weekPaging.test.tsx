import { act, renderHook } from "@testing-library/react-native";

import { useWeekPaging } from "./weekPaging";

// 2026-10-20 is a Tuesday; its week runs Sunday 10/18 to Saturday 10/24.
describe("useWeekPaging", () => {
  it("starts on the week of the open day", () => {
    const { result } = renderHook(() =>
      useWeekPaging("2026-10-20", "2026-10-20"),
    );
    expect(result.current.end).toBe("2026-10-24");
    expect(result.current.title).toBe("This week");
  });

  it("goes back week by week, and names the week", () => {
    const { result } = renderHook(() =>
      useWeekPaging("2026-10-20", "2026-10-20"),
    );
    act(() => result.current.earlier());
    act(() => result.current.earlier());
    expect(result.current.end).toBe("2026-10-10");
    expect(result.current.title).toBe("Week of Sun, Oct 4");
  });

  it("never goes later than the week that holds today", () => {
    const { result } = renderHook(() =>
      useWeekPaging("2026-10-20", "2026-10-20"),
    );
    act(() => result.current.later());
    expect(result.current.end).toBe("2026-10-24");
    act(() => result.current.earlier());
    act(() => result.current.later());
    act(() => result.current.later());
    expect(result.current.end).toBe("2026-10-24");
  });

  it("can move forward again from an older open day, up to today's week", () => {
    const { result } = renderHook(() =>
      useWeekPaging("2026-10-05", "2026-10-20"),
    );
    expect(result.current.end).toBe("2026-10-10");
    act(() => result.current.later());
    act(() => result.current.later());
    act(() => result.current.later());
    expect(result.current.end).toBe("2026-10-24");
  });

  it("starts from the new day's week when another day is opened", () => {
    const { result, rerender } = renderHook(
      ({ day }: { day: string }) => useWeekPaging(day, "2026-10-20"),
      { initialProps: { day: "2026-10-20" } },
    );
    act(() => result.current.earlier());
    rerender({ day: "2026-10-19" });
    expect(result.current.end).toBe("2026-10-24");
  });
});
