import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Day } from "../../api/food";

type Props = {
  day: Day;
  removeWorkout: (workoutId: string) => Promise<void>;
};

function kcal(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} kcal`;
}

/** "Surplus" or "deficit" in words, for the gap between eaten and burned. */
export function balanceText(balance: number): string {
  const size = Math.abs(Math.round(balance));
  if (size === 0) return "Even: eaten matches burned";
  return balance > 0
    ? `${size.toLocaleString("en-US")} kcal surplus (eaten more than burned)`
    : `${size.toLocaleString("en-US")} kcal deficit (burned more than eaten)`;
}

/** What the day burned (resting + workouts), the balance against what was eaten, and workouts. */
export function DayBurn({ day, removeWorkout }: Props) {
  const { burned, workouts } = day;
  return (
    <View accessibilityLabel="Calories burned">
      <Text style={styles.heading}>Burned</Text>
      <Text style={styles.big}>{kcal(burned.total)}</Text>
      <Text style={styles.line}>
        {burned.resting === null
          ? "Resting burn unknown until your profile is set up"
          : `${kcal(burned.resting)} resting`}
        {" + "}
        {kcal(burned.workouts)} workouts
      </Text>
      <Text
        style={[styles.balance, day.balance_calories < 0 && styles.deficit]}
        accessibilityLabel="Balance"
      >
        {balanceText(day.balance_calories)}
      </Text>

      {workouts.map((workout) => (
        <View key={workout.id} style={styles.workout}>
          <View style={styles.workoutText}>
            <Text style={styles.name}>{workout.label}</Text>
            <Text style={styles.line}>
              {workout.minutes} min · {workout.intensity} ·{" "}
              {workout.calories_typed ? "" : "about "}
              {kcal(workout.calories)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${workout.label} workout`}
            onPress={() => void removeWorkout(workout.id)}
            style={styles.action}
          >
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111111",
    marginTop: 24,
    marginBottom: 4,
  },
  big: { fontSize: 28, fontWeight: "700", color: "#111111" },
  line: { fontSize: 14, color: "#555555", marginTop: 2 },
  balance: { fontSize: 16, color: "#1a6b2f", marginTop: 6, marginBottom: 8 },
  deficit: { color: "#b00020" },
  workout: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
  },
  workoutText: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600", color: "#111111" },
  action: { paddingVertical: 8, paddingHorizontal: 10 },
  removeText: { fontSize: 15, color: "#b00020" },
});
