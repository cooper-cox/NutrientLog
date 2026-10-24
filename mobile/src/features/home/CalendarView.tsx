import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Month } from "../../api/food";
import { colors } from "../../ui/theme";
import { kcalText } from "../food/amounts";
import { firstWeekday, monthOf, monthTitle, shiftMonth } from "./dates";

type Props = {
  month: Month;
  /** The day currently open (YYYY-MM-DD). */
  selected: string | null;
  onPickDay: (date: string) => void;
  onMonthChange: (month: string) => void;
  /** Shown at the right of the month row (the Close button). */
  trailing?: ReactNode;
  /** Show only the week containing this day, so the day's details have room. */
  onlyWeekOf?: string | null;
};

const WEEK = ["S", "M", "T", "W", "T", "F", "S"];

/** A month grid: days with food are filled, days that reached the target are lighter, workouts get a dot. */
export function CalendarView({
  month,
  selected,
  onPickDay,
  onMonthChange,
  trailing,
  onlyWeekOf = null,
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
  let rows = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  const oneWeek = onlyWeekOf !== null;
  if (oneWeek) {
    const found = rows.filter((row) => row.some((d) => d?.date === onlyWeekOf));
    if (found.length > 0) rows = found;
  }

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.nav}>
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
        {trailing}
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
                  accessibilityState={{ selected: day.date === selected }}
                  disabled={future}
                  onPress={() => onPickDay(day.date)}
                  style={[
                    styles.day,
                    logged && styles.dayLogged,
                    hit && styles.dayHit,
                    day.date === selected && styles.daySelected,
                    day.date === month.today && styles.dayToday,
                    future && styles.dayFuture,
                  ]}
                >
                  <Text style={[styles.dayText, hit && styles.dayTextHit]}>
                    {number}
                  </Text>
                </Pressable>
                <View style={[styles.dot, trained && styles.dotOn]} />
              </View>
            );
          })}
        </View>
      ))}

      {oneWeek ? null : (
        <>
          <View style={styles.legend}>
            <Text style={styles.legendItem}>
              <Text style={{ color: colors.logged }}>●</Text> Food logged
            </Text>
            <Text style={styles.legendItem}>
              <Text style={{ color: colors.hit }}>●</Text> Reached target
              {goal !== null ? ` (${goal} kcal)` : ""}
            </Text>
            <Text style={styles.legendItem}>
              <Text style={{ color: colors.accent }}>●</Text> Worked out
            </Text>
          </View>
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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  nav: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text, marginHorizontal: 4 },
  arrow: { minWidth: 40, minHeight: 44, alignItems: "center", justifyContent: "center" },
  arrowOff: { opacity: 0.25 },
  arrowText: { fontSize: 28, color: colors.text },
  row: { flexDirection: "row" },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    color: colors.muted,
    paddingVertical: 4,
  },
  cell: { flex: 1, alignItems: "center", paddingVertical: 3, minHeight: 46 },
  day: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "transparent",
  },
  dayLogged: { backgroundColor: colors.logged },
  dayHit: { backgroundColor: colors.hit },
  daySelected: { borderColor: colors.text },
  dayToday: { borderColor: colors.accent },
  dayFuture: { opacity: 0.35 },
  dayText: { fontSize: 14, fontWeight: "600", color: colors.text },
  dayTextHit: { color: "#1B1230" },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3, backgroundColor: "transparent" },
  dotOn: { backgroundColor: colors.accent },
  legend: { marginTop: 10 },
  legendItem: { fontSize: 12, color: colors.muted, marginTop: 2 },
  summary: { fontSize: 14, color: colors.text, marginTop: 8 },
});
