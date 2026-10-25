import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Goal } from "../../api/endpoints";
import type { Day, LogEntry, Nutrients } from "../../api/food";
import { colors } from "../../ui/theme";
import { kcalText } from "./amounts";

/** The nutrients shown on this page, in the order of the design. `target` comes from the goal. */
const ROWS: {
  key: string;
  label: string;
  unit: string;
  target?: (goal: Goal) => number;
}[] = [
  {
    key: "calories",
    label: "Calories",
    unit: "kcal",
    target: (g) => g.calories,
  },
  { key: "protein_g", label: "Protein", unit: "g", target: (g) => g.protein_g },
  { key: "fat_g", label: "Fat", unit: "g", target: (g) => g.fat_g },
  { key: "carb_g", label: "Carbs", unit: "g", target: (g) => g.carb_g },
  { key: "fiber_g", label: "Fiber", unit: "g" },
  { key: "sugar_g", label: "Sugar", unit: "g" },
  { key: "sodium_mg", label: "Sodium", unit: "mg" },
  { key: "calcium_mg", label: "Calcium", unit: "mg" },
  { key: "iron_mg", label: "Iron", unit: "mg" },
  { key: "vitamin_d_ug", label: "Vitamin D", unit: "mcg" },
];

function shown(value: number): string {
  const rounded =
    value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toLocaleString("en-US");
}

/** How much of the bar is the chosen food and how much is everything else (each 0 to 1). */
export function shares(
  total: number,
  pick: number,
  target: number | undefined,
): { other: number; pick: number } {
  const whole =
    target !== undefined && target > 0 ? Math.max(target, total) : total;
  if (whole <= 0) return { other: 0, pick: 0 };
  const chosen = Math.min(pick, total);
  return { other: (total - chosen) / whole, pick: chosen / whole };
}

function value(nutrients: Nutrients, key: string): number | null {
  const found = nutrients[key];
  return typeof found === "number" ? found : null;
}

function pickLine(
  entry: LogEntry | undefined,
  key: string,
  unit: string,
  total: number,
): string {
  if (!entry) return "Tap a food to see its share";
  const mine = value(entry.nutrients, key);
  if (mine === null) return "not listed for this food";
  if (mine === 0) return "none from this food";
  const percent = total > 0 ? Math.round((mine / total) * 100) : 0;
  return `${shown(mine)} ${unit} from this food (${percent}%)`;
}

/** The day's nutrients against targets; tap a food on the right to see how much it gave. */
export function NutritionPage({ day, goal }: { day: Day; goal: Goal }) {
  const [picked, setPicked] = useState<string | null>(null);
  const entry = day.entries.find((e) => e.id === picked) ?? day.entries[0];

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            Today
          </Text>
          {entry ? (
            <Text style={styles.legend}>
              orange = <Text style={styles.legendFood}>{entry.food_name}</Text>
            </Text>
          ) : null}
        </View>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {ROWS.map((row) => {
            const total = value(day.totals, row.key) ?? 0;
            const target = row.target?.(goal);
            const mine = entry ? (value(entry.nutrients, row.key) ?? 0) : 0;
            const bar = shares(total, mine, target);
            return (
              <View key={row.key} style={styles.row}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowName}>{row.label}</Text>
                  <Text style={styles.rowTotal}>
                    {shown(total)}
                    {target !== undefined ? ` / ${shown(target)}` : ""}{" "}
                    {row.unit}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={{ flex: bar.other, backgroundColor: colors.bar }}
                  />
                  <View
                    style={{ flex: bar.pick, backgroundColor: colors.accent }}
                  />
                  <View
                    style={{ flex: Math.max(0, 1 - bar.other - bar.pick) }}
                  />
                </View>
                <Text style={styles.rowPick}>
                  {pickLine(entry, row.key, row.unit, total)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.foods}>
        <Text style={styles.foodsHint}>Tap a food</Text>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {day.entries.length === 0 ? (
            <Text style={styles.note}>Nothing logged yet.</Text>
          ) : null}
          {day.entries.map((item) => {
            const on = item.id === entry?.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Show ${item.food_name}`}
                accessibilityState={{ selected: on }}
                onPress={() => setPicked(item.id)}
                style={[styles.food, on && styles.foodOn]}
              >
                <Text style={[styles.foodName, on && styles.foodTextOn]}>
                  {item.food_name}
                </Text>
                <Text style={[styles.foodKcal, on && styles.foodTextOn]}>
                  {kcalText(item.nutrients.calories ?? null)}
                </Text>
              </Pressable>
            );
          })}
          <Text style={styles.note}>
            Meals will show here later, with their own totals.
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 14,
    marginRight: 10,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  cardTitle: { fontSize: 19, fontWeight: "600", color: colors.text },
  legend: {
    fontSize: 12,
    color: colors.muted,
    flexShrink: 1,
    textAlign: "right",
  },
  legendFood: { color: colors.accent, fontWeight: "600" },
  row: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowHead: { flexDirection: "row", justifyContent: "space-between" },
  rowName: { fontSize: 13, color: colors.muted },
  rowTotal: { fontSize: 13, fontWeight: "600", color: colors.text },
  track: {
    flexDirection: "row",
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    overflow: "hidden",
    marginVertical: 3,
  },
  rowPick: { fontSize: 11, color: colors.muted },
  foods: { width: 92 },
  foodsHint: {
    fontSize: 12,
    color: colors.muted,
    paddingLeft: 4,
    marginBottom: 8,
  },
  food: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
    marginBottom: 8,
  },
  foodOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  foodName: { fontSize: 13, fontWeight: "600", color: colors.text },
  foodKcal: { fontSize: 11, color: colors.muted },
  foodTextOn: { color: colors.onAccent },
  note: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    paddingHorizontal: 4,
    marginTop: 4,
  },
});
