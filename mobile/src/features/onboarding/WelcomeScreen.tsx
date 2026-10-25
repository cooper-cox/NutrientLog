import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Goal, Profile } from "../../api/endpoints";
import { formatRate } from "../../lib/units";
import { Button, DISCLAIMER } from "../../ui/components";
import { colors, type } from "../../ui/theme";
import { GoalExplanation } from "../profile/GoalExplanation";

const AIM = {
  gain: "to gain weight",
  lose: "to lose weight",
  maintain: "to stay the same",
};

/** Shown once after the survey: the person's numbers, why they are what they are, and Start. */
export function WelcomeScreen({
  profile,
  goal,
  onStart,
}: {
  profile: Profile;
  goal: Goal;
  onStart: () => void;
}) {
  const insets = useSafeAreaInsets();
  const trying = goal.rate_kg_per_week > 0;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={styles.title} accessibilityRole="header">
        {profile.name ? `Welcome, ${profile.name}` : "Welcome"}
      </Text>
      <Text style={styles.subtitle}>
        NutrientLog tracks what you eat and burn, and shows what it means for
        your body. Here is where we start.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your daily target</Text>
        <View style={styles.hero}>
          <Text
            style={styles.calories}
            accessibilityLabel={`${goal.calories} calories per day`}
          >
            {goal.calories.toLocaleString("en-US")}
          </Text>
          <Text style={styles.caloriesLabel}>
            calories a day{"\n"}
            {AIM[profile.goal_type]}
          </Text>
        </View>
        {trying ? (
          <Text style={styles.small}>
            About {formatRate(goal.rate_kg_per_week, profile.unit_preference)} a
            week
          </Text>
        ) : null}
        <View style={styles.macros}>
          <Text style={styles.macroName}>
            Protein <Text style={styles.macroValue}>{goal.protein_g} g</Text>
          </Text>
          <Text style={styles.macroName}>
            Fat <Text style={styles.macroValue}>{goal.fat_g} g</Text>
          </Text>
          <Text style={styles.macroName}>
            Carbs <Text style={styles.macroValue}>{goal.carb_g} g</Text>
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Where these numbers come from</Text>
        <GoalExplanation profile={profile} goal={goal} />
        <Text style={styles.small}>
          You can change your answers any time from the Profile tab.
        </Text>
        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </View>

      <Button title="Start tracking" onPress={onStart} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20 },
  title: {
    fontSize: type.title,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.muted,
    marginTop: 8,
    marginBottom: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: type.header,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
  },
  hero: { flexDirection: "row", alignItems: "center" },
  calories: {
    fontSize: 44,
    fontWeight: "700",
    letterSpacing: -1,
    color: colors.accent,
    marginRight: 12,
  },
  caloriesLabel: { fontSize: 14, lineHeight: 18, color: colors.muted },
  small: { fontSize: 13, color: colors.muted, marginTop: 6 },
  macros: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  macroName: { fontSize: 13, color: colors.muted },
  macroValue: { fontSize: 14, fontWeight: "600", color: colors.text },
  disclaimer: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 8,
  },
});
