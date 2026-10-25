import { Picker } from "@react-native-picker/picker";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "../../api/client";
import type { Week } from "../../api/food";
import {
  addWorkout,
  changeWorkout,
  getActivities,
  type Activities,
  type Workout,
} from "../../api/workouts";
import { Button, FormGroup, Input } from "../../ui/components";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { colors, pickerItem } from "../../ui/theme";
import { monthDay, shortDate, weekdayShort } from "../home/dates";
import { useDay } from "../home/useDay";
import { useWeek } from "../home/useWeek";
import { WeekBars } from "../home/WeekBars";
import { WeekPager } from "../home/weekPaging";
import { parseNumber } from "../food/amounts";

type Props = {
  /** The day to add to (YYYY-MM-DD); null is today. */
  date: string | null;
  /** Goes back to today (shown as a button while another day is open). */
  onToday?: () => void;
  /** Opens a day tapped in the bar chart (null for today). */
  onPickDay?: (date: string | null) => void;
  /** Changes after something is added or removed, so the week and the day reload. */
  reloadKey: number;
  onCalendar: () => void;
  /** Called after a workout is added or removed, so other screens reload. */
  onChanged: () => void;
};

/** Minutes offered on the wheel: every 5 up to 2 h, every 15 up to 4 h, then every 30. */
export function minuteOptions(max: number): number[] {
  const options: number[] = [];
  for (let m = 5; m <= max; m += m < 120 ? 5 : m < 240 ? 15 : 30) {
    options.push(m);
  }
  return options;
}

/** The wheel's minutes, plus the current value when it is not a step (an edited 7-minute workout). */
function minuteOptionsWith(max: number, current: number): number[] {
  const options = minuteOptions(max);
  if (options.includes(current)) return options;
  return [...options, current].sort((a, b) => a - b);
}

/** Two short lines each, so they never run to a third. */
const INTENSITIES = [
  { value: "light", label: "Light", hint: "Easy, you could chat" },
  { value: "moderate", label: "Moderate", hint: "Sweating a little" },
  { value: "hard", label: "Hard", hint: "Heavy breathing, minimal breaks" },
];

/** The bars for one Sunday-to-Saturday week: minutes a day, the viewed day in orange, and only days after the real today left empty. */
export function weekChart(week: Week, viewed: string, today: string = viewed) {
  // `?? 0` so an older backend that does not send workout_minutes shows empty bars, not NaN.
  const mins = week.days.map((d) => d.workout_minutes ?? 0);
  const longest = Math.max(0, ...mins);
  const top = Math.max(60, Math.ceil(longest / 30) * 30);
  const workouts = week.days.reduce((n, d) => n + d.workouts.length, 0);
  const minutes = mins.reduce((n, m) => n + m, 0);
  return {
    top,
    workouts,
    minutes,
    bars: week.days.map((d, i) => ({
      label: `${weekdayShort(d.date)}\n${monthDay(d.date)}`,
      // Only days after the real today are empty; days after the viewed day still show.
      fraction: d.date > today ? null : mins[i] / top,
      today: d.date === viewed,
      pickable: d.date <= today,
    })),
  };
}

function WeekPage({
  reloadKey,
  end,
  day,
  today,
  onPick,
}: {
  reloadKey: number;
  end: string;
  day: string;
  today: string;
  onPick?: (date: string | null) => void;
}) {
  const { state } = useWeek(reloadKey, end);
  if (state.kind === "error") {
    return <Text style={styles.error}>{state.message}</Text>;
  }
  if (state.kind !== "ready" || state.week.end !== end) {
    return <ActivityIndicator />;
  }
  const week = state.week;
  const chart = weekChart(week, day, today);
  return (
    <View>
      <View style={styles.cardHead}>
        <Text style={styles.small}>Minutes</Text>
        <Text style={styles.small}>
          {chart.workouts} {chart.workouts === 1 ? "workout" : "workouts"} ·{" "}
          {chart.minutes} min
        </Text>
      </View>
      <WeekBars
        bars={chart.bars}
        height={64}
        ticks={[String(chart.top), String(chart.top / 2), "0"]}
        onPick={(i) => {
          const picked = week.days[i].date;
          onPick?.(picked === today ? null : picked);
        }}
        accessibilityLabel="Minutes worked out each day of this week"
      />
    </View>
  );
}

/** The minutes chart: a fixed Sunday-to-Saturday week you can drag sideways to other weeks. */
function WeekCard({
  reloadKey,
  day,
  today,
  onPick,
}: {
  reloadKey: number;
  day: string;
  today: string;
  onPick?: (date: string | null) => void;
}) {
  return (
    <View style={styles.card}>
      <WeekPager
        day={day}
        today={today}
        renderHead={(title) => <Text style={styles.cardTitle}>{title}</Text>}
        renderWeek={(end) => (
          <WeekPage
            reloadKey={reloadKey}
            end={end}
            day={day}
            today={today}
            onPick={onPick}
          />
        )}
      />
    </View>
  );
}

function intensityText(workout: Workout): string {
  const how = workout.calories_typed ? "" : "about ";
  return `${workout.minutes} min · ${workout.intensity} · ${how}${Math.round(workout.calories)} kcal`;
}

/** Workout: this week at a glance, add a workout on two wheels, and what was done today. */
export function WorkoutScreen({
  date,
  reloadKey,
  onCalendar,
  onToday,
  onPickDay,
  onChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const { state, removeWorkout } = useDay(reloadKey, date);
  const day = state.kind === "ready" ? state.day : null;
  const [choices, setChoices] = useState<Activities | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string>("");
  const [minutes, setMinutes] = useState(30);
  const [intensity, setIntensity] = useState("moderate");
  const [calories, setCalories] = useState("");
  const [adding, setAdding] = useState(false);
  // The workout being changed (the form is filled with it), or null when adding a new one.
  const [editing, setEditing] = useState<Workout | null>(null);
  const scroller = useRef<ScrollView>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Bumped by "Try again" to ask for the activities once more.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    getActivities()
      .then((found) => {
        if (!live) return;
        setChoices(found);
        setActivity((now) => now || found.activities[0]?.key || "");
      })
      .catch((error: unknown) => {
        if (!live) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Could not load the activities.",
        );
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const typed = parseNumber(calories);
  const caloriesBad = calories.trim() !== "" && (typed === null || typed <= 0);

  function startEdit(workout: Workout) {
    setEditing(workout);
    setActivity(workout.activity);
    setMinutes(workout.minutes);
    setIntensity(workout.intensity);
    setCalories(workout.calories_typed ? String(workout.calories) : "");
    setProblem(null);
    scroller.current?.scrollTo({ y: 0, animated: true });
  }

  function cancelEdit() {
    setEditing(null);
    setCalories("");
    setProblem(null);
  }

  async function add() {
    if (caloriesBad) return;
    setAdding(true);
    setProblem(null);
    try {
      const body = {
        activity,
        minutes,
        intensity,
        ...(typed !== null ? { calories: typed } : {}),
      };
      if (editing) {
        await changeWorkout(editing.id, body);
        setEditing(null);
      } else {
        await addWorkout({ ...body, ...(date ? { loggedOn: date } : {}) });
      }
      setCalories("");
      onChanged();
    } catch (error) {
      setProblem(
        error instanceof ApiError ? error.message : "Could not add that.",
      );
    }
    setAdding(false);
  }

  return (
    <ScrollView
      ref={scroller}
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: 24 },
      ]}
    >
      <ScreenHeader
        title="Workout"
        subtitle={day ? shortDate(day.date) : undefined}
        onCalendar={onCalendar}
        pastDay={date !== null && !(day !== null && day.date === day.today)}
        onToday={onToday}
      />

      {day ? (
        <WeekCard
          reloadKey={reloadKey}
          day={day.date}
          today={day.today}
          onPick={onPickDay}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {editing ? `Edit ${editing.label}` : "Add a workout"}
        </Text>

        {loadError ? (
          <View>
            <Text style={styles.error} accessibilityRole="alert">
              {loadError}
            </Text>
            <Button
              title="Try again"
              onPress={() => {
                setLoadError(null);
                setAttempt((n) => n + 1);
              }}
              secondary
            />
          </View>
        ) : null}
        {!choices && !loadError ? <ActivityIndicator /> : null}

        {choices ? (
          <>
            <View style={styles.wheels}>
              <View style={styles.activity}>
                <Picker
                  accessibilityLabel="Activity"
                  itemStyle={pickerItem}
                  style={styles.wheel}
                  selectedValue={activity}
                  onValueChange={(value: string) => setActivity(value)}
                >
                  {choices.activities.map((item) => (
                    <Picker.Item
                      key={item.key}
                      label={item.label}
                      value={item.key}
                    />
                  ))}
                </Picker>
                <View pointerEvents="none" style={styles.band} />
              </View>
              <View style={styles.minutes}>
                <Picker
                  accessibilityLabel="Minutes"
                  itemStyle={pickerItem}
                  style={styles.wheel}
                  selectedValue={minutes}
                  onValueChange={(value: number) => setMinutes(value)}
                >
                  {minuteOptionsWith(choices.max_minutes, minutes).map(
                    (value) => (
                      <Picker.Item
                        key={value}
                        label={`${value} min`}
                        value={value}
                      />
                    ),
                  )}
                </Picker>
                <View pointerEvents="none" style={styles.band} />
              </View>
            </View>

            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Intensity"
              style={styles.levels}
            >
              {INTENSITIES.map((level) => {
                const on = level.value === intensity;
                return (
                  <Pressable
                    key={level.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={level.label}
                    accessibilityHint={level.hint}
                    onPress={() => setIntensity(level.value)}
                    style={[styles.level, on && styles.levelOn]}
                  >
                    <Text style={[styles.levelName, on && styles.levelNameOn]}>
                      {level.label}
                    </Text>
                    <Text
                      style={[styles.levelHint, on && styles.levelNameOn]}
                      numberOfLines={2}
                    >
                      {level.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <FormGroup
              label="Calories burned (if known)"
              error={
                caloriesBad
                  ? "Enter a number above 0, or leave empty."
                  : undefined
              }
            >
              <Input
                value={calories}
                onChangeText={setCalories}
                placeholder="(optional)"
                keyboardType="decimal-pad"
                accessibilityLabel="Calories burned"
                hasError={caloriesBad}
              />
            </FormGroup>

            {problem ? (
              <Text style={styles.error} accessibilityRole="alert">
                {problem}
              </Text>
            ) : null}
            <Button
              title={
                editing
                  ? "Save changes"
                  : date
                    ? `Add to ${shortDate(date)}`
                    : "Add to today"
              }
              onPress={() => void add()}
              disabled={adding || caloriesBad || activity === ""}
            />
            {editing ? (
              <Button title="Cancel" onPress={cancelEdit} secondary />
            ) : null}
          </>
        ) : null}
      </View>

      {day ? (
        day.workouts.length === 0 ? (
          <Text style={styles.none}>No workouts logged for this day yet.</Text>
        ) : (
          day.workouts.map((workout) => (
            <View key={workout.id} style={[styles.card, styles.logged]}>
              <View style={styles.loggedText}>
                <Text style={styles.cardTitle}>{workout.label}</Text>
                <Text style={styles.small}>{intensityText(workout)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${workout.label}`}
                onPress={() => startEdit(workout)}
                style={[styles.remove, styles.edit]}
              >
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${workout.label}`}
                onPress={() => {
                  if (editing?.id === workout.id) cancelEdit();
                  void removeWorkout(workout.id).then(onChanged);
                }}
                style={styles.remove}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))
        )
      ) : null}
    </ScrollView>
  );
}

/** The iPhone wheel is always 216 high and cannot shrink, so it sits in a clipped, shorter box. */
const NATIVE_WHEEL_HEIGHT = 216;
const WHEEL_HEIGHT = 132;
/** The size of the wheel's own grey selected row, so the purple border fits it exactly. */
const BAND_HEIGHT = 44;
const BAND_INSET = 9;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20 },
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
    marginBottom: 6,
  },
  cardTitle: { fontSize: 19, fontWeight: "600", color: colors.text },
  small: { fontSize: 13, color: colors.muted },
  error: { fontSize: 15, color: colors.danger, marginBottom: 8 },
  wheels: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderRadius: 16,
    marginVertical: 12,
    paddingHorizontal: 8,
  },
  activity: {
    flex: 5,
    marginRight: 8,
    height: WHEEL_HEIGHT,
    overflow: "hidden",
  },
  minutes: { flex: 3, height: WHEEL_HEIGHT, overflow: "hidden" },
  wheel: {
    height: NATIVE_WHEEL_HEIGHT,
    marginTop: -(NATIVE_WHEEL_HEIGHT - WHEEL_HEIGHT) / 2,
  },
  band: {
    position: "absolute",
    left: BAND_INSET,
    right: BAND_INSET,
    top: (WHEEL_HEIGHT - BAND_HEIGHT) / 2,
    height: BAND_HEIGHT,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.bar,
  },
  levels: { flexDirection: "row", marginBottom: 18 },
  level: {
    flex: 1,
    minHeight: 66,
    marginHorizontal: 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  levelOn: { borderWidth: 1.5, borderColor: colors.bar },
  levelName: { fontSize: 14, fontWeight: "600", color: colors.muted },
  levelHint: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted,
    textAlign: "center",
    marginTop: 3,
  },
  levelNameOn: { color: colors.text },
  none: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginVertical: 8,
  },
  logged: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  loggedText: { flex: 1, paddingRight: 8 },
  remove: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.accent,
    justifyContent: "center",
  },
  edit: { borderColor: colors.border, marginRight: 8 },
  editText: { fontSize: 13, fontWeight: "600", color: colors.text },
  removeText: { fontSize: 13, fontWeight: "600", color: colors.accent },
});
