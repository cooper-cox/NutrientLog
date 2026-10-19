import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Week } from "../../api/food";
import { kcalText } from "../food/amounts";
import { dayLabel, weekdayShort } from "./dates";

type Props = {
  week: Week;
  today: string;
  /** Tapping a day opens it. */
  onPickDay: (date: string) => void;
};

/** Seven days as bars: how much was eaten against the daily target. */
export function WeekView({ week, today, onPickDay }: Props) {
  const goal = week.goal_calories;
  const top = Math.max(goal ?? 0, ...week.days.map((day) => day.calories), 1);
  return (
    <View>
      <Text style={styles.summary}>
        {week.average_calories === null
          ? "Nothing logged this week yet."
          : `Average ${kcalText(week.average_calories)} a day (days with food logged)`}
      </Text>
      {week.days.map((day) => {
        const label = dayLabel(day.date, today);
        const hit = goal !== null && day.entries > 0 && day.calories >= goal;
        return (
          <Pressable
            key={day.date}
            accessibilityRole="button"
            accessibilityLabel={`Open ${label}`}
            onPress={() => onPickDay(day.date)}
            style={styles.row}
          >
            <Text style={styles.day}>{weekdayShort(day.date)}</Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.bar,
                  hit && styles.barHit,
                  { width: `${Math.round((day.calories / top) * 100)}%` },
                ]}
              />
              {goal !== null ? (
                <View
                  style={[
                    styles.goalLine,
                    { left: `${Math.round((goal / top) * 100)}%` },
                  ]}
                />
              ) : null}
            </View>
            <Text style={styles.kcal}>
              {day.entries === 0 ? "–" : kcalText(day.calories)}
            </Text>
          </Pressable>
        );
      })}
      {goal !== null ? (
        <Text style={styles.note}>
          The thin line is your target ({goal} kcal). Tap a day to open it.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { fontSize: 16, color: "#222222", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  day: { width: 44, fontSize: 15, color: "#111111", fontWeight: "600" },
  track: {
    flex: 1,
    height: 18,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    marginHorizontal: 8,
    justifyContent: "center",
  },
  bar: { height: 18, backgroundColor: "#7a9cc6", borderRadius: 4 },
  barHit: { backgroundColor: "#3f8f5a" },
  goalLine: {
    position: "absolute",
    top: -2,
    bottom: -2,
    width: 2,
    backgroundColor: "#111111",
  },
  kcal: { width: 84, textAlign: "right", fontSize: 14, color: "#222222" },
  note: { fontSize: 13, color: "#555555", marginTop: 8 },
});
