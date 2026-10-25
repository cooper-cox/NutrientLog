import { StyleSheet, Text, View } from "react-native";

import type { Day } from "../../api/food";
import { colors, type } from "../../ui/theme";

type Props = {
  day: Day;
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

/** What the day burned (resting + workouts) and the balance against what was eaten. */
export function DayBurn({ day }: Props) {
  const { burned } = day;
  return (
    <View style={styles.card} accessibilityLabel="Calories burned">
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  heading: { fontSize: type.header, fontWeight: "600", color: colors.text },
  big: { fontSize: 28, fontWeight: "700", color: colors.accent, marginTop: 6 },
  line: { fontSize: 14, color: colors.muted, marginTop: 2 },
  balance: { fontSize: 15, color: colors.good, marginTop: 8 },
  deficit: { color: colors.warn },
});
