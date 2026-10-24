/** The one place the app's colours and text sizes live (see docs/design-decisions.md). */
export const colors = {
  /** Near-black screen background (the 60). */
  bg: "#0E0B14",
  /** Purple cards (the 30). */
  surface: "#2B2045",
  surface2: "#3A2C5E",
  tabBar: "#17112A",
  text: "#EFEAF8",
  muted: "#B0A6CB",
  /** Orange: buttons, today, key numbers (the 10). */
  accent: "#F2913D",
  /** Dark text that sits on orange. */
  onAccent: "#1A1024",
  /** Chart bars and selection borders. */
  bar: "#8F7BD6",
  /** Calendar day fills: food logged, and target reached. */
  logged: "#5A4A94",
  hit: "#9C88E6",
  border: "rgba(176,166,203,0.35)",
  divider: "rgba(239,234,248,0.08)",
  danger: "#F28B96",
  good: "#7FD6A0",
  warn: "#F2B35A",
  scrim: "rgba(0,0,0,0.55)",
} as const;

/** Larger text sizes chosen in the design review. */
export const type = {
  title: 30,
  header: 19,
  subtitle: 16,
  body: 16,
  small: 13,
} as const;

/** Text style for the native iOS wheels, so they are readable on the dark background. */
export const pickerItem = { color: colors.text, fontSize: 18 } as const;
