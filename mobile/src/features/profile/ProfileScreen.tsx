import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ActivityLevel, Goal, Profile } from "../../api/endpoints";
import { cmToFtIn, formatRate, formatWeight } from "../../lib/units";
import { DISCLAIMER } from "../../ui/components";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { GoalExplanation } from "./GoalExplanation";
import { colors } from "../../ui/theme";

type Props = {
  profile: Profile;
  goal: Goal;
  onChangeAnswers: () => void;
  /** Only given in development (Expo Go); the released app has no such button. */
  onCheckConnection?: () => void;
  /** For testing only: forget this phone's login and start with a fresh survey. */
  onStartOver?: () => void;
};

const ACTIVITY: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Lightly active",
  moderate: "Moderately active",
  very_active: "Very active",
  extra_active: "Extra active",
};

const AIM = {
  gain: "Gain weight",
  lose: "Lose weight",
  maintain: "Maintain my weight",
};

/** Whole years between a birth date (YYYY-MM-DD) and `now`. */
export function ageOn(birth: string, now: Date): number {
  const [year, month, day] = birth.split("-").map(Number);
  let age = now.getFullYear() - year;
  if (
    now.getMonth() + 1 < month ||
    (now.getMonth() + 1 === month && now.getDate() < day)
  ) {
    age -= 1;
  }
  return age;
}

function heightText(cm: number, units: Profile["unit_preference"]): string {
  if (units === "metric") return `${Math.round(cm)} cm`;
  const { feet, inches } = cmToFtIn(cm);
  const whole = Math.round(inches);
  return whole === 12 ? `${feet + 1} ft 0 in` : `${feet} ft ${whole} in`;
}

function Edit({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
    >
      <Text style={styles.edit}>Edit</Text>
    </Pressable>
  );
}

/** Profile: the goal and daily targets with how they were set, and the answers behind them. */
export function ProfileScreen({
  profile,
  goal,
  onChangeAnswers,
  onCheckConnection,
  onStartOver,
}: Props) {
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState(false);
  const units = profile.unit_preference;
  const trying = goal.rate_kg_per_week > 0;
  const aim =
    profile.goal_type === "gain"
      ? "to gain weight"
      : profile.goal_type === "lose"
        ? "to lose weight"
        : "to stay the same";
  const pace = !trying
    ? "Staying where you are"
    : `${profile.goal_type === "gain" ? "Gain" : "Lose"} ${formatRate(goal.rate_kg_per_week, units)}`;

  const rows: [string, string][] = [
    ["Weight", formatWeight(profile.weight_kg, units)],
    ["Height", heightText(profile.height_cm, units)],
    ["Age", String(ageOn(profile.birth_date, new Date()))],
    ["Activity", ACTIVITY[profile.activity_level]],
    ["Aim", AIM[profile.goal_type]],
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: 24 },
      ]}
    >
      <ScreenHeader title="Profile" subtitle={profile.name ?? undefined} />

      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.cardTitle}>Your goal</Text>
          <Edit onPress={onChangeAnswers} label="Edit your goal" />
        </View>
        <View style={styles.heroRow}>
          <Text
            style={styles.calories}
            accessibilityLabel={`${goal.calories} calories per day`}
          >
            {goal.calories.toLocaleString("en-US")}
          </Text>
          <Text style={styles.caloriesLabel}>
            calories a day{"\n"}
            {aim}
          </Text>
        </View>
        <Text style={styles.small}>
          {pace} · resting burn {Math.round(goal.bmr).toLocaleString("en-US")}{" "}
          kcal
        </Text>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            details ? "Hide details" : "Details: how these numbers were set"
          }
          onPress={() => setDetails(!details)}
          style={styles.outline}
        >
          <Text style={styles.outlineAccent}>
            {details ? "Hide details" : "Details: how these numbers were set"}
          </Text>
        </Pressable>

        {details ? (
          <View style={styles.details}>
            <GoalExplanation profile={profile} goal={goal} />
            <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.cardTitle}>About you</Text>
          <Edit onPress={onChangeAnswers} label="Edit about you" />
        </View>
        {rows.map(([name, value]) => (
          <View key={name} style={styles.row}>
            <Text style={styles.rowName}>{name}</Text>
            <Text style={styles.rowValue}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.pair}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit my answers"
          onPress={onChangeAnswers}
          style={[styles.outline, styles.pairItem]}
        >
          <Text style={styles.outlineText}>Edit my answers</Text>
        </Pressable>
        {onCheckConnection ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Check connection"
            onPress={onCheckConnection}
            style={[styles.outline, styles.pairItem]}
          >
            <Text style={styles.outlineText}>Check connection</Text>
          </Pressable>
        ) : null}
      </View>

      {onStartOver ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start over (testing)"
          onPress={() =>
            Alert.alert(
              "Start over?",
              "This forgets your answers on this phone and shows the survey again, like a first launch. Your old data stays on the server but you will not see it.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Start over",
                  style: "destructive",
                  onPress: onStartOver,
                },
              ],
            )
          }
          style={styles.startOver}
        >
          <Text style={styles.startOverText}>Start over (testing only)</Text>
        </Pressable>
      ) : null}

      <Text style={styles.footer}>
        Estimates only, not medical advice. Talk to a doctor or dietitian before
        big changes.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  cardTitle: { fontSize: 19, fontWeight: "600", color: colors.text },
  edit: { fontSize: 13, fontWeight: "600", color: colors.accent },
  heroRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  calories: {
    fontSize: 44,
    fontWeight: "700",
    letterSpacing: -1,
    color: colors.accent,
    marginRight: 12,
  },
  caloriesLabel: { fontSize: 14, lineHeight: 18, color: colors.muted },
  small: { fontSize: 13, color: colors.muted, marginTop: 8 },
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
  outline: {
    minHeight: 44,
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineAccent: { fontSize: 14, fontWeight: "600", color: colors.accent },
  startOver: {
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    marginTop: 8,
  },
  startOverText: { fontSize: 14, color: colors.danger },
  outlineText: { fontSize: 14, fontWeight: "600", color: colors.text },
  details: { marginTop: 14 },
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
  disclaimer: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 34,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowName: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 14, fontWeight: "600", color: colors.text },
  pair: { flexDirection: "row", marginBottom: 4 },
  pairItem: { flex: 1, marginHorizontal: 4, marginTop: 0 },
  footer: {
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.muted,
    textAlign: "center",
    marginTop: 12,
  },
});
