import { weekStarts, weekTitle, WEEKS_BACK } from "./weekPaging";

// 2026-10-20 is a Tuesday; its week runs Sunday 10/18 to Saturday 10/24.
describe("weekStarts", () => {
  it("ends with the week that holds today, so later weeks cannot be reached", () => {
    const starts = weekStarts("2026-10-20", "2026-10-20");
    expect(starts[starts.length - 1]).toBe("2026-10-18");
    expect(starts).toHaveLength(WEEKS_BACK);
  });

  it("lists whole Sundays, oldest first, one week apart", () => {
    const starts = weekStarts("2026-10-20", "2026-10-20");
    expect(starts[starts.length - 2]).toBe("2026-10-11");
    expect([...starts].sort()).toEqual(starts);
  });

  it("reaches back further when the open day is older than the usual range", () => {
    const starts = weekStarts("2025-01-08", "2026-10-20");
    expect(starts[0]).toBe("2025-01-05");
    expect(starts[starts.length - 1]).toBe("2026-10-18");
  });
});

describe("weekTitle", () => {
  it("says This week for today's week and names the others", () => {
    expect(weekTitle("2026-10-18", "2026-10-20")).toBe("This week");
    expect(weekTitle("2026-10-04", "2026-10-20")).toBe("Week of Sun, Oct 4");
  });
});
