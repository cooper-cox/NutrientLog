import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Day } from "../../api/food";
import type { Goal } from "../../api/endpoints";
import { Button } from "../../ui/components";
import { colors, type } from "../../ui/theme";
import { kcalText } from "../food/amounts";
import { CalendarView } from "./CalendarView";
import { dayLabel, shortDate } from "./dates";
import { NutritionFacts } from "./NutritionFacts";
import { useDay } from "./useDay";
import { useMonth } from "./useMonth";

type Props = {
  reloadKey: number;
  goal: Goal;
  /** The day being looked at (YYYY-MM-DD); null is today. */
  selected: string | null;
  /** Picking a day makes it the day the Food and Workout screens add to. */
  onPick: (date: string | null) => void;
  onClose: () => void;
};

function summaryLine(day: Day): string {
  const eaten = `${kcalText(day.totals.calories ?? 0)} eaten`;
  const workouts = day.workouts.map((w) => `${w.label} ${w.minutes} min`);
  return [eaten, ...workouts].join(" · ");
}

function MacroRow({
  name,
  eaten,
  target,
}: {
  name: string;
  eaten: number;
  target: number;
}) {
  const fraction = target > 0 ? Math.min(1, eaten / target) : 0;
  return (
    <View style={styles.macroRow}>
      <Text style={styles.macroName}>{name}</Text>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]}
        />
      </View>
      <Text style={styles.macroValue}>
        {eaten} / {target} g
      </Text>
    </View>
  );
}

/** The calendar sheet over the (faded) screen. The tab bar below stays usable. */
export function CalendarOverlay({
  reloadKey,
  goal,
  selected,
  onPick,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  // null means "this month" and "today"; the server says which dates those are.
  const [month, setMonth] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const monthState = useMonth(reloadKey, month);
  const dayState = useDay(reloadKey, selected);

  const today =
    monthState.state.kind === "ready" ? monthState.state.month.today : null;
  const shown = selected ?? today;

  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close calendar background"
        style={styles.scrim}
        onPress={onClose}
      />
      <View style={[styles.sheet, { paddingTop: insets.top + 8 }]}>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
        >
          {monthState.state.kind === "loading" ? <ActivityIndicator /> : null}
          {monthState.state.kind === "error" ? (
            <View>
              <Text accessibilityRole="alert" style={styles.error}>
                {monthState.state.message}
              </Text>
              <Button title="Try again" onPress={monthState.reload} secondary />
              <Button title="Close" onPress={onClose} secondary />
            </View>
          ) : null}
          {monthState.state.kind === "ready" ? (
            <CalendarView
              month={monthState.state.month}
              selected={shown}
              onlyWeekOf={more ? shown : null}
              onPickDay={(date) => onPick(date === today ? null : date)}
              onMonthChange={(next) => {
                setMonth(next);
                setMore(false);
              }}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close calendar"
                  onPress={onClose}
                  style={styles.close}
                >
                  <Text style={styles.closeText}>Close ▴</Text>
                </Pressable>
              }
            />
          ) : null}

          {dayState.state.kind === "ready" ? (
            <View style={styles.dayCard}>
              <View style={styles.dayHead}>
                <View style={styles.dayText}>
                  <Text style={styles.dayTitle} accessibilityRole="header">
                    {dayLabel(
                      dayState.state.day.date,
                      dayState.state.day.today,
                    )}
                    {dayState.state.day.date === dayState.state.day.today
                      ? `, ${shortDate(dayState.state.day.date)}`
                      : ""}
                  </Text>
                  <Text style={styles.daySummary}>
                    {summaryLine(dayState.state.day)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    more ? "Show less" : "More about this day"
                  }
                  onPress={() => setMore(!more)}
                  style={styles.more}
                >
                  <Text style={styles.moreText}>
                    {more ? "Less ▴" : "More ▾"}
                  </Text>
                </Pressable>
              </View>

              {more ? (
                <View>
                  <Text style={styles.section}>Eaten</Text>
                  {dayState.state.day.entries.length === 0 ? (
                    <Text style={styles.empty}>
                      Nothing was logged this day.
                    </Text>
                  ) : (
                    dayState.state.day.entries.map((entry) => (
                      <View key={entry.id} style={styles.entry}>
                        <View style={styles.entryText}>
                          <Text style={styles.entryName}>
                            {entry.food_name}
                          </Text>
                          <Text style={styles.entryLine}>
                            {entry.amount_text ??
                              `${Math.round(entry.grams)} g`}
                          </Text>
                        </View>
                        <Text style={styles.entryKcal}>
                          {kcalText(entry.nutrients.calories ?? null)}
                        </Text>
                      </View>
                    ))
                  )}
                  <Text style={styles.section}>Macros</Text>
                  <MacroRow
                    name="Protein"
                    eaten={Math.round(dayState.state.day.totals.protein_g ?? 0)}
                    target={goal.protein_g}
                  />
                  <MacroRow
                    name="Fat"
                    eaten={Math.round(dayState.state.day.totals.fat_g ?? 0)}
                    target={goal.fat_g}
                  />
                  <MacroRow
                    name="Carbs"
                    eaten={Math.round(dayState.state.day.totals.carb_g ?? 0)}
                    target={goal.carb_g}
                  />
                  {dayState.state.day.entries.length > 0 ? (
                    <NutritionFacts totals={dayState.state.day.totals} />
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          {dayState.state.kind === "error" ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {dayState.state.message}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: {
    maxHeight: "100%",
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  sheetContent: { paddingBottom: 20 },
  error: { fontSize: 16, color: colors.danger, marginVertical: 12 },
  close: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    justifyContent: "center",
  },
  closeText: { fontSize: 14, fontWeight: "600", color: colors.text },
  dayCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: colors.bg,
    padding: 16,
  },
  dayHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayText: { flex: 1, paddingRight: 8 },
  dayTitle: { fontSize: type.header, fontWeight: "700", color: colors.text },
  daySummary: { fontSize: type.small, color: colors.muted, marginTop: 2 },
  more: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accent,
    justifyContent: "center",
  },
  moreText: { fontSize: 14, fontWeight: "600", color: colors.accent },
  section: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 16,
    marginBottom: 4,
  },
  empty: { fontSize: 14, color: colors.muted },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  entryText: { flex: 1 },
  entryName: { fontSize: 14, fontWeight: "600", color: colors.text },
  entryLine: { fontSize: 12, color: colors.muted },
  entryKcal: { fontSize: 14, color: colors.text },
  macroRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  macroName: { width: 58, fontSize: 13, color: colors.muted },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    overflow: "hidden",
    marginHorizontal: 12,
  },
  fill: { height: "100%", backgroundColor: colors.bar },
  macroValue: {
    width: 92,
    textAlign: "right",
    fontSize: 13,
    color: colors.text,
  },
});
