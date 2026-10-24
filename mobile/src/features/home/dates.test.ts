import {
  dayLabel,
  firstWeekday,
  monthOf,
  monthTitle,
  shiftDate,
  shiftMonth,
  shortDate,
  monthDay,
  weekStart,
  weekdayShort,
} from "./dates";

describe("dates", () => {
  it("moves a date across month, year and leap-day edges", () => {
    expect(shiftDate("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDate("2026-10-18", 0)).toBe("2026-10-18");
  });

  it("names days", () => {
    expect(weekdayShort("2026-10-18")).toBe("Sun");
    expect(shortDate("2026-10-05")).toBe("Mon, Oct 5");
  });

  it("says Today and Yesterday, otherwise the date", () => {
    expect(dayLabel("2026-10-18", "2026-10-18")).toBe("Today");
    expect(dayLabel("2026-10-17", "2026-10-18")).toBe("Yesterday");
    expect(dayLabel("2026-10-10", "2026-10-18")).toBe("Sat, Oct 10");
  });

  it("moves months across year edges and names them", () => {
    expect(shiftMonth("2026-10", 1)).toBe("2026-11");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", -14)).toBe("2025-08");
    expect(monthOf("2026-10-18")).toBe("2026-10");
    expect(monthTitle("2026-10")).toBe("October 2026");
  });

  it("knows which weekday a month starts on", () => {
    expect(firstWeekday("2026-10")).toBe(4); // Thursday
    expect(firstWeekday("2026-11")).toBe(0); // Sunday
  });
});

describe("week helpers", () => {
  it("finds the Sunday that starts a week", () => {
    expect(weekStart("2026-10-20")).toBe("2026-10-18"); // a Tuesday
    expect(weekStart("2026-10-18")).toBe("2026-10-18"); // already a Sunday
    expect(weekStart("2026-10-24")).toBe("2026-10-18"); // the Saturday
    expect(weekStart("2026-11-01")).toBe("2026-11-01");
    expect(weekStart("2026-01-01")).toBe("2025-12-28"); // across a year
  });

  it("writes a date as mm/dd", () => {
    expect(monthDay("2026-10-05")).toBe("10/05");
    expect(monthDay("2026-12-31")).toBe("12/31");
  });
});
