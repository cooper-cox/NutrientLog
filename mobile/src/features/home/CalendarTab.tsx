import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button } from "../../ui/components";
import { kcalText } from "../food/amounts";
import { CalendarView } from "./CalendarView";
import { dayLabel } from "./dates";
import { DayEntries } from "./DayEntries";
import { NutritionFacts } from "./NutritionFacts";
import { useDay } from "./useDay";
import { useMonth } from "./useMonth";

type Props = {
  reloadKey: number;
};

/** The calendar, with what was eaten on the tapped day (and its nutrition) shown below it. */
export function CalendarTab({ reloadKey }: Props) {
  // null means "this month" and "today"; the server says which dates those are.
  const [month, setMonth] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const monthState = useMonth(reloadKey, month);
  const dayState = useDay(reloadKey, picked);

  if (monthState.state.kind === "loading") return <ActivityIndicator />;
  if (monthState.state.kind === "error") {
    return (
      <View>
        <Text accessibilityRole="alert" style={styles.error}>
          {monthState.state.message}
        </Text>
        <Button title="Try again" onPress={monthState.reload} secondary />
      </View>
    );
  }
  const calendar = monthState.state.month;
  const selected = picked ?? calendar.today;

  async function remove(entryId: string) {
    await dayState.remove(entryId);
    monthState.reload();
  }
  async function changeAmount(entryId: string, text: string) {
    await dayState.changeAmount(entryId, text);
    monthState.reload();
  }

  return (
    <View>
      <CalendarView
        month={calendar}
        selected={selected}
        onPickDay={(date) => setPicked(date === calendar.today ? null : date)}
        onMonthChange={setMonth}
      />

      {dayState.state.kind === "loading" ? (
        <ActivityIndicator style={styles.spinner} />
      ) : null}
      {dayState.state.kind === "error" ? (
        <View>
          <Text accessibilityRole="alert" style={styles.error}>
            {dayState.state.message}
          </Text>
          <Button title="Try again" onPress={dayState.reload} secondary />
        </View>
      ) : null}
      {dayState.state.kind === "ready" ? (
        <>
          <Text style={styles.summary} accessibilityRole="header">
            {dayLabel(dayState.state.day.date, dayState.state.day.today)}:{" "}
            {kcalText(dayState.state.day.totals.calories ?? 0)}
            {dayState.state.day.goal_calories !== null
              ? ` of ${dayState.state.day.goal_calories} kcal`
              : ""}
          </Text>
          <DayEntries
            day={dayState.state.day}
            label={dayLabel(dayState.state.day.date, dayState.state.day.today)}
            isToday={dayState.state.day.date === dayState.state.day.today}
            remove={remove}
            changeAmount={changeAmount}
          />
          {dayState.state.day.entries.length > 0 ? (
            <NutritionFacts totals={dayState.state.day.totals} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  error: { fontSize: 16, color: "#b00020", marginVertical: 16 },
  spinner: { marginTop: 24 },
  summary: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111111",
    marginTop: 24,
  },
});
