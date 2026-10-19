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

import type { Goal, Profile } from "../../api/endpoints";
import type { Day } from "../../api/food";
import { Button } from "../../ui/components";
import { kcalText } from "../food/amounts";
import { dayLabel, shiftDate, shortDate } from "./dates";
import { useDay } from "./useDay";
import { CalendarTab } from "./CalendarTab";
import { DayEntries } from "./DayEntries";
import { WeekTab } from "./WeekTab";

type Props = {
  profile: Profile;
  goal: Goal;
  /** Changes after something is added, so the day reloads. */
  reloadKey: number;
  /** The day being looked at (YYYY-MM-DD); null means today. Kept by the app so it survives Add food. */
  date: string | null;
  onDateChange: (date: string | null) => void;
  onAddFood: () => void;
  onShowTargets: () => void;
};

const TAB_NAMES = { day: "Day", week: "Week", calendar: "Calendar" } as const;

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
  return (
    <>
      <Text
        style={[styles.big, over && styles.over]}
        accessibilityLabel={`${Math.abs(Math.round(remaining))} calories ${over ? "over" : "left"}`}
      >
        {Math.abs(Math.round(remaining))}
      </Text>
      <Text style={styles.label}>
        {over
          ? "calories over your target"
          : isToday
            ? "calories left today"
            : "calories left that day"}
      </Text>
    </>
  );
}

/** A day: calories left, what was eaten, and the way to add more. Arrows move between days. */
export function HomeScreen({
  profile,
  goal,
  reloadKey,
  date,
  onDateChange,
  onAddFood,
  onShowTargets,
}: Props) {
  const insets = useSafeAreaInsets();
  const { state, reload, remove, changeAmount } = useDay(reloadKey, date);
  const [view, setView] = useState<"day" | "week" | "calendar">("day");
  const shown = state.kind === "ready" ? state.day.date : date;
  const today = state.kind === "ready" ? state.day.today : null;
  const isToday = shown === null || shown === today;
  const label =
    state.kind === "ready"
      ? dayLabel(state.day.date, state.day.today)
      : date
        ? shortDate(date)
        : "Today";

  function goTo(offset: number) {
    if (shown === null) return;
    const next = shiftDate(shown, offset);
    onDateChange(next === today ? null : next);
  }

  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text style={styles.title} accessibilityRole="header">
        {profile.name ?? "NutrientLog"}
      </Text>

      <View style={styles.tabs}>
        {(["day", "week", "calendar"] as const).map((name) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={`${TAB_NAMES[name]} view`}
            accessibilityState={{ selected: view === name }}
            onPress={() => setView(name)}
            style={[styles.tab, view === name && styles.tabOn]}
          >
            <Text style={[styles.tabText, view === name && styles.tabTextOn]}>
              {TAB_NAMES[name]}
            </Text>
          </Pressable>
        ))}
      </View>

      {view === "calendar" ? (
        <CalendarTab reloadKey={reloadKey} />
      ) : view === "week" ? (
        <WeekTab
          reloadKey={reloadKey}
          onPickDay={(picked) => {
            onDateChange(picked);
            setView("day");
          }}
        />
      ) : (
        <>
          <View style={styles.dateRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              disabled={shown === null}
              onPress={() => goTo(-1)}
              style={styles.arrow}
            >
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>
            <Text style={styles.dateLabel} accessibilityRole="header">
              {label}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next day"
              disabled={isToday}
              onPress={() => goTo(1)}
              style={[styles.arrow, isToday && styles.arrowOff]}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          </View>

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
                <Left day={state.day} isToday={isToday} />
                <Text style={styles.sub}>
                  Eaten {kcalText(state.day.totals.calories ?? 0)} of{" "}
                  {goal.calories} kcal
                </Text>
              </View>
              <View style={styles.macros}>
                <Text style={styles.macro}>
                  Protein {grams(state.day.totals.protein_g)} / {goal.protein_g}{" "}
                  g
                </Text>
                <Text style={styles.macro}>
                  Fat {grams(state.day.totals.fat_g)} / {goal.fat_g} g
                </Text>
                <Text style={styles.macro}>
                  Carbs {grams(state.day.totals.carb_g)} / {goal.carb_g} g
                </Text>
              </View>

              <Button
                title={isToday ? "Add food" : `Add food to ${label}`}
                onPress={onAddFood}
              />

              <DayEntries
                day={state.day}
                label={label}
                isToday={isToday}
                remove={remove}
                changeAmount={changeAmount}
              />
            </>
          ) : null}
        </>
      )}

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
  tabs: { flexDirection: "row", marginTop: 12, marginBottom: 4 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    marginRight: 8,
  },
  tabOn: { backgroundColor: "#111111" },
  tabText: { fontSize: 15, color: "#111111" },
  tabTextOn: { color: "#ffffff" },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  dateLabel: { fontSize: 20, fontWeight: "600", color: "#111111" },
  arrow: { paddingHorizontal: 16, paddingVertical: 4 },
  arrowOff: { opacity: 0.25 },
  arrowText: { fontSize: 32, color: "#111111" },
  entryBlock: {},
  action: { paddingVertical: 8, paddingHorizontal: 10 },
  editText: { fontSize: 15, color: "#1a5fb4" },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: "#ffffff",
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111111",
    marginBottom: 12,
  },
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
  removeText: { fontSize: 15, color: "#b00020" },
  footer: { marginTop: 32 },
});
