import { StyleSheet, Text, View } from "react-native";

import type { Goal, Profile } from "../../api/endpoints";
import { formatRate, formatWeight } from "../../lib/units";
import { colors } from "../../ui/theme";

function signed(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

/** How the calorie and macro numbers were set, in plain words (Profile Details and Welcome). */
export function GoalExplanation({
  profile,
  goal,
}: {
  profile: Profile;
  goal: Goal;
}) {
  const units = profile.unit_preference;
  const trying = goal.rate_kg_per_week > 0;
  return (
    <View>
      <Text style={styles.paragraph}>
        Your body burns about {Math.round(goal.bmr)} calories a day at rest.
        With your activity level that comes to about {Math.round(goal.tdee)} a
        day to stay at the same weight.
        {trying
          ? ` To ${profile.goal_type === "gain" ? "gain" : "lose"} weight we ${
              profile.goal_type === "gain" ? "add" : "remove"
            } ${Math.abs(Math.round(goal.daily_adjustment))} calories (${signed(goal.daily_adjustment)} a day).`
          : " Because you want to stay where you are, nothing is added or removed."}
      </Text>
      {goal.weeks_to_goal !== null && profile.goal_weight_kg !== null ? (
        <Text style={styles.paragraph}>
          At {formatRate(goal.rate_kg_per_week, units)}, reaching{" "}
          {formatWeight(profile.goal_weight_kg, units)} would take about{" "}
          {goal.weeks_to_goal} {goal.weeks_to_goal === 1 ? "week" : "weeks"}.
        </Text>
      ) : null}
      {goal.rate_was_capped ? (
        <Text style={styles.notice}>
          The pace you asked for was faster than we consider safe, so it was
          reduced to {formatRate(goal.rate_kg_per_week, units)}.
        </Text>
      ) : null}
      {goal.floor_was_applied ? (
        <Text style={styles.notice}>
          Your target was raised to the lowest daily amount we recommend, so it
          is higher than the maths alone gave.
        </Text>
      ) : null}
      <Text style={styles.paragraph}>
        Protein is set from your weight, fat is about a quarter of your
        calories, and carbs fill the rest. These are estimates. Real bodies
        vary, so adjust if your weight isn’t moving the way you want.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    marginBottom: 10,
  },
  notice: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.warn,
    marginBottom: 10,
  },
});
