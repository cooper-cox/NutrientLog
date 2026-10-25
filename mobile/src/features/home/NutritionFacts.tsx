import { StyleSheet, Text, View } from "react-native";

import type { Nutrients } from "../../api/food";
import { colors } from "../../ui/theme";

/** Every nutrient the app tracks, in label order. Keys match the server's nutrient list. */
const ROWS: { key: string; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "fat_g", label: "Total fat", unit: "g" },
  { key: "saturated_fat_g", label: "Saturated fat", unit: "g" },
  { key: "carb_g", label: "Carbohydrate", unit: "g" },
  { key: "fiber_g", label: "Fiber", unit: "g" },
  { key: "sugar_g", label: "Total sugars", unit: "g" },
  { key: "cholesterol_mg", label: "Cholesterol", unit: "mg" },
  { key: "sodium_mg", label: "Sodium", unit: "mg" },
  { key: "potassium_mg", label: "Potassium", unit: "mg" },
  { key: "calcium_mg", label: "Calcium", unit: "mg" },
  { key: "iron_mg", label: "Iron", unit: "mg" },
  { key: "magnesium_mg", label: "Magnesium", unit: "mg" },
  { key: "zinc_mg", label: "Zinc", unit: "mg" },
  { key: "vitamin_a_ug", label: "Vitamin A", unit: "mcg" },
  { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg" },
  { key: "vitamin_d_ug", label: "Vitamin D", unit: "mcg" },
  { key: "vitamin_k_ug", label: "Vitamin K", unit: "mcg" },
  { key: "vitamin_b12_ug", label: "Vitamin B12", unit: "mcg" },
  { key: "folate_ug", label: "Folate", unit: "mcg" },
];

function amount(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return "not listed";
  const shown = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${shown} ${unit}`;
}

/** The day's nutrition totals, like a label. */
export function NutritionFacts({ totals }: { totals: Nutrients }) {
  return (
    <View>
      <Text style={styles.heading} accessibilityRole="header">
        Nutrients
      </Text>
      {ROWS.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <Text
            style={styles.value}
            accessibilityLabel={`${row.label} ${amount(totals[row.key], row.unit)}`}
          >
            {amount(totals[row.key], row.unit)}
          </Text>
        </View>
      ))}
      <Text style={styles.note}>
        Totals add up only the foods that list that nutrient, so a total can be
        too low where a food leaves it out.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 16,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  label: { fontSize: 13, color: colors.muted },
  value: { fontSize: 13, color: colors.text },
  note: { fontSize: 13, color: colors.muted, marginTop: 8 },
});
