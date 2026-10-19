const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parts(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** A calendar date (YYYY-MM-DD) moved by whole days. No clocks or timezones involved. */
export function shiftDate(iso: string, days: number): string {
  const moved = parts(iso);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** "Mon" for a date. */
export function weekdayShort(iso: string): string {
  return WEEKDAYS[parts(iso).getUTCDay()];
}

/** "Mon, Oct 5". */
export function shortDate(iso: string): string {
  const date = parts(iso);
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "Today", "Yesterday", or "Mon, Oct 5". */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === shiftDate(today, -1)) return "Yesterday";
  return shortDate(iso);
}

/** "2026-10" for a date. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** A month ("2026-10") moved by whole months. */
export function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split("-").map(Number);
  const moved = new Date(Date.UTC(year, number - 1 + by, 1));
  return moved.toISOString().slice(0, 7);
}

/** "October 2026". */
export function monthTitle(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return `${MONTH_NAMES[number - 1]} ${year}`;
}

/** Which weekday a month starts on, 0 = Sunday. */
export function firstWeekday(month: string): number {
  return parts(`${month}-01`).getUTCDay();
}
