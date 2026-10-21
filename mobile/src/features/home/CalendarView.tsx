import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Month } from "../../api/food";
import { kcalText } from "../food/amounts";
import { firstWeekday, monthOf, monthTitle, shiftMonth } from "./dates";

type Props = {
  month: Month;
  /** The day currently open on the Day tab (YYYY-MM-DD). */
  selected: string | null;
  onPickDay: (date: string) => void;
  onMonthChange: (month: string) => void;
};

const WEEK = ["S", "M", "T", "W", "T", "F", "S"];

/** A month grid: days with food are filled, days that reached the target are green. */
export function CalendarView({
  month,
  selected,
  onPickDay,
  onMonthChange,
}: Props) {
  const goal = month.goal_calories;
  const blanks = firstWeekday(month.month);
  const workoutDays = month.days.filter((d) => d.workouts.length > 0).length;
  const isCurrent = month.month === monthOf(month.today);
  const cells: (Month["days"][number] | null)[] = [
    ...Array.from({ length: blanks }, () => null),
    ...month.days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );

  return (
    <View>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => onMonthChange(shiftMonth(month.month, -1))}
          style={styles.arrow}
        >
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {monthTitle(month.month)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          disabled={isCurrent}
          onPress={() => onMonthChange(shiftMonth(month.month, 1))}
          style={[styles.arrow, isCurrent && styles.arrowOff]}
        >
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        {WEEK.map((letter, i) => (
          <Text key={i} style={styles.weekday}>
            {letter}
          </Text>
        ))}
      </View>

      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((day, c) => {
            if (day === null) return <View key={c} style={styles.cell} />;
            const number = Number(day.date.slice(8));
            const future = day.date > month.today;
            const logged = day.entries > 0;
            const hit = goal !== null && logged && day.calories >= goal;
            const trained = day.workouts.length > 0;
            const monthName = monthTitle(month.month).split(" ")[0];
            const label =
              `${monthName} ${number}, ` +
              (logged ? kcalText(day.calories) : "nothing logged") +
              (trained ? `, workout: ${day.workouts.join(", ")}` : "");
            return (
              <View key={c} style={styles.cell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  disabled={future}
                  onPress={() => onPickDay(day.date)}
                  style={[
                    styles.day,
                    logged && styles.dayLogged,
                    hit && styles.dayHit,
                    day.date === month.today && styles.dayToday,
                    day.date === selected && styles.daySelected,
                    future && styles.dayFuture,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      (logged || hit) && styles.dayTextOn,
                      future && styles.dayTextFuture,
                    ]}
                  >
                    {number}
                  </Text>
                </Pressable>
                {trained ? (
                  <Text style={styles.workout} numberOfLines={1}>
                    {day.workouts[0]}
                    {day.workouts.length > 1
                      ? ` +${day.workouts.length - 1}`
                      : ""}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}

      <Text style={styles.summary}>
        {month.average_calories === null
          ? "Nothing logged this month yet."
          : `Average ${kcalText(month.average_calories)} a day (days with food logged)`}
      </Text>
      <Text style={styles.summary} accessibilityLabel="Workout days">
        {workoutDays === 0
          ? "No workouts logged this month."
          : `Worked out ${workoutDays} ${workoutDays === 1 ? "day" : "days"} this month`}
      </Text>
      <Text style={styles.note}>
        Blue: food logged. Words under a day: the workout done. Green: reached
        your target
        {goal !== null ? ` (${goal} kcal)` : ""}. Tap a day to open it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: "600", color: "#111111" },
  arrow: { paddingHorizontal: 16, paddingVertical: 4 },
  arrowOff: { opacity: 0.25 },
  arrowText: { fontSize: 32, color: "#111111" },
  row: { flexDirection: "row" },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    color: "#777777",
    paddingVertical: 4,
  },
  cell: { flex: 1, aspectRatio: 0.85, padding: 3 },
  day: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 100,
    borderWidth: 2,
    borderColor: "transparent",
  },
  dayLogged: { backgroundColor: "#7a9cc6" },
  dayHit: { backgroundColor: "#3f8f5a" },
  dayToday: { borderColor: "#111111" },
  daySelected: { borderColor: "#d98a00" },
  dayFuture: { opacity: 0.3 },
  dayText: { fontSize: 15, color: "#111111" },
  dayTextOn: { color: "#ffffff", fontWeight: "700" },
  dayTextFuture: { color: "#777777" },
  workout: {
    fontSize: 10,
    textAlign: "center",
    color: "#1a5fb4",
    fontWeight: "600",
  },
  summary: { fontSize: 16, color: "#222222", marginTop: 16 },
  note: { fontSize: 13, color: "#555555", marginTop: 6 },
});
