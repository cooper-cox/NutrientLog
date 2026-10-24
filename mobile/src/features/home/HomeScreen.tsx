import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Goal } from "../../api/endpoints";
import type { Day, Week } from "../../api/food";
import { Button } from "../../ui/components";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { colors, type } from "../../ui/theme";
import { kcalText } from "../food/amounts";
import { DayBurn } from "./DayBurn";
import { dayLabel, shortDate, weekdayShort } from "./dates";
import { useDay } from "./useDay";
import { useWeek } from "./useWeek";
import { WeekBars } from "./WeekBars";

type Props = {
  goal: Goal;
  /** Changes after something is added, so the day reloads. */
  reloadKey: number;
  /** The day being looked at (YYYY-MM-DD); null means today. */
  date: string | null;
  onCalendar: () => void;
};

function grams(value: number | null): number {
  return Math.round(value ?? 0);
}

function Left({ day, isToday }: { day: Day; isToday: boolean }) {
  const remaining = day.remaining_calories;
  if (remaining === null) {
    return (
      <Text style={styles.label}>
        Set up your targets to see calories left.
      </Text>
    );
  }
  const over = remaining < 0;
  const size = Math.abs(Math.round(remaining));
  return (
    <View style={styles.heroRow}>
      <Text
        style={[styles.big, over && styles.over]}
        accessibilityLabel={`${size} calories ${over ? "over" : "left"}`}
      >
        {size.toLocaleString("en-US")}
      </Text>
      <Text style={styles.label}>
        {over
          ? "calories over"
          : isToday
            ? "calories left"
            : "calories left that day"}
      </Text>
    </View>
  );
}

function Macro({
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

function weekBars(week: Week, goal: number | null, selected: string) {
  const top = Math.max(goal ?? 0, ...week.days.map((day) => day.calories), 1);
  return {
    bars: week.days.map((day) => ({
      label: weekdayShort(day.date).slice(0, 1),
      fraction: day.calories / top,
      today: day.date === selected,
    })),
    target: goal !== null ? goal / top : null,
  };
}

/** Home: calories left for the day, last seven days, today's macros and what was burned. */
export function HomeScreen({ goal, reloadKey, date, onCalendar }: Props) {
  const insets = useSafeAreaInsets();
  const { state, reload } = useDay(reloadKey, date);
  const weekState = useWeek(reloadKey, date);
  const day = state.kind === "ready" ? state.day : null;
  const shown = day?.date ?? date;
  const isToday = date === null || (day !== null && day.date === day.today);
  const title = day
    ? dayLabel(day.date, day.today)
    : date
      ? shortDate(date)
      : "Today";
  const eaten = day?.totals.calories ?? 0;
  const fraction =
    day && goal.calories > 0 ? Math.min(1, eaten / goal.calories) : 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: 24 },
      ]}
    >
      <ScreenHeader
        title={title}
        subtitle={shown ? shortDate(shown) : undefined}
        onCalendar={onCalendar}
      />

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

      {day ? (
        <>
          <View style={styles.hero}>
            <Left day={day} isToday={isToday} />
            <View
              style={styles.progress}
              accessibilityRole="progressbar"
              accessibilityLabel={`${Math.round(fraction * 100)} percent of the day's calories eaten`}
            >
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(fraction * 100)}%` },
                ]}
              />
            </View>
            <View style={styles.eatenRow}>
              <Text style={styles.small}>Eaten {kcalText(eaten)}</Text>
              <Text style={styles.small}>
                {goal.calories.toLocaleString("en-US")} kcal target
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Last 7 days</Text>
              {weekState.state.kind === "ready" &&
              weekState.state.week.average_calories !== null ? (
                <Text style={styles.small}>
                  avg {kcalText(weekState.state.week.average_calories)}
                </Text>
              ) : null}
            </View>
            {weekState.state.kind === "ready" ? (
              (() => {
                const { bars, target } = weekBars(
                  weekState.state.week,
                  weekState.state.week.goal_calories,
                  weekState.state.week.end,
                );
                return (
                  <WeekBars
                    bars={bars}
                    target={target}
                    accessibilityLabel="Calories eaten in the last seven days, with the target as a dashed line"
                  />
                );
              })()
            ) : weekState.state.kind === "error" ? (
              <Text style={styles.small}>{weekState.state.message}</Text>
            ) : (
              <ActivityIndicator />
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {isToday ? "Macros today" : "Macros"}
            </Text>
            <Macro
              name="Protein"
              eaten={grams(day.totals.protein_g)}
              target={goal.protein_g}
            />
            <Macro
              name="Fat"
              eaten={grams(day.totals.fat_g)}
              target={goal.fat_g}
            />
            <Macro
              name="Carbs"
              eaten={grams(day.totals.carb_g)}
              target={goal.carb_g}
            />
          </View>

          <DayBurn day={day} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20 },
  spinner: { marginTop: 40 },
  error: { fontSize: 16, color: colors.danger, marginVertical: 16 },
  hero: { marginBottom: 16, paddingHorizontal: 4 },
  heroRow: { flexDirection: "row", alignItems: "baseline" },
  big: {
    fontSize: 64,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -2,
    marginRight: 10,
  },
  over: { color: colors.danger },
  label: { fontSize: type.subtitle, color: colors.muted },
  progress: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surface,
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  eatenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  small: { fontSize: type.small, color: colors.muted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: type.header,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  macroRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  macroName: { width: 58, fontSize: type.small, color: colors.muted },
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
    fontSize: type.small,
    color: colors.text,
  },
});
