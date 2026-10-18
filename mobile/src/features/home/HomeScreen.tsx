import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Goal, Profile } from "../../api/endpoints";
import type { Day } from "../../api/food";
import { Button } from "../../ui/components";
import { kcalText } from "../food/amounts";
import { useDay } from "./useDay";

type Props = {
  profile: Profile;
  goal: Goal;
  /** Changes after something is added, so today reloads. */
  reloadKey: number;
  onAddFood: () => void;
  onShowTargets: () => void;
};

function grams(value: number | null): number {
  return Math.round(value ?? 0);
}

function Left({ day }: { day: Day }) {
  const remaining = day.remaining_calories;
  if (remaining === null) {
    return (
      <Text style={styles.label}>
        Set up your targets to see calories left.
      </Text>
    );
  }
  const over = remaining < 0;
  return (
    <>
      <Text
        style={[styles.big, over && styles.over]}
        accessibilityLabel={`${Math.abs(Math.round(remaining))} calories ${over ? "over" : "left"}`}
      >
        {Math.abs(Math.round(remaining))}
      </Text>
      <Text style={styles.label}>
        {over ? "calories over your target" : "calories left today"}
      </Text>
    </>
  );
}

/** Today: calories left, what was eaten, and the way to add more. */
export function HomeScreen({
  profile,
  goal,
  reloadKey,
  onAddFood,
  onShowTargets,
}: Props) {
  const insets = useSafeAreaInsets();
  const { state, reload, remove } = useDay(reloadKey);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text style={styles.title} accessibilityRole="header">
        {profile.name ? `${profile.name}, today` : "Today"}
      </Text>

      {state.kind === "loading" ? (
        <ActivityIndicator style={styles.spinner} />
      ) : null}
      {state.kind === "error" ? (
        <View>
          <Text style={styles.error} accessibilityRole="alert">
            {state.message}
          </Text>
          <Button title="Try again" onPress={reload} secondary />
        </View>
      ) : null}

      {state.kind === "ready" ? (
        <>
          <View style={styles.hero}>
            <Left day={state.day} />
            <Text style={styles.sub}>
              Eaten {kcalText(state.day.totals.calories ?? 0)} of{" "}
              {goal.calories} kcal
            </Text>
          </View>
          <View style={styles.macros}>
            <Text style={styles.macro}>
              Protein {grams(state.day.totals.protein_g)} / {goal.protein_g} g
            </Text>
            <Text style={styles.macro}>
              Fat {grams(state.day.totals.fat_g)} / {goal.fat_g} g
            </Text>
            <Text style={styles.macro}>
              Carbs {grams(state.day.totals.carb_g)} / {goal.carb_g} g
            </Text>
          </View>

          <Button title="Add food" onPress={onAddFood} />

          <Text style={styles.heading}>Eaten today</Text>
          {state.day.entries.length === 0 ? (
            <Text style={styles.empty}>
              Nothing yet. Tap &quot;Add food&quot; to start.
            </Text>
          ) : (
            state.day.entries.map((entry) => (
              <View key={entry.id} style={styles.entry}>
                <View style={styles.entryText}>
                  <Text style={styles.entryName}>{entry.food_name}</Text>
                  <Text style={styles.entryLine}>
                    {entry.amount_text ?? `${Math.round(entry.grams)} g`} ·{" "}
                    {kcalText(entry.nutrients.calories ?? null)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${entry.food_name}`}
                  onPress={() => void remove(entry.id)}
                  style={styles.remove}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))
          )}
        </>
      ) : null}

      <View style={styles.footer}>
        <Button
          title="My targets and answers"
          onPress={onShowTargets}
          secondary
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingHorizontal: 20 },
  title: { fontSize: 26, fontWeight: "700", color: "#111111" },
  spinner: { marginTop: 40 },
  error: { fontSize: 16, color: "#b00020", marginVertical: 16 },
  hero: { alignItems: "center", marginTop: 24, marginBottom: 16 },
  big: { fontSize: 64, fontWeight: "700", color: "#111111" },
  over: { color: "#b00020" },
  label: { fontSize: 18, color: "#555555", textAlign: "center" },
  sub: { fontSize: 15, color: "#555555", marginTop: 6 },
  macros: { alignItems: "center", marginBottom: 20 },
  macro: { fontSize: 15, color: "#222222", marginTop: 2 },
  heading: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111111",
    marginTop: 24,
    marginBottom: 8,
  },
  empty: { fontSize: 16, color: "#555555" },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
  },
  entryText: { flex: 1 },
  entryName: { fontSize: 16, fontWeight: "600", color: "#111111" },
  entryLine: { fontSize: 14, color: "#555555", marginTop: 2 },
  remove: { paddingVertical: 8, paddingHorizontal: 10 },
  removeText: { fontSize: 15, color: "#b00020" },
  footer: { marginTop: 32 },
});
