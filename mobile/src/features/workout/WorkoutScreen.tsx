import { Picker } from "@react-native-picker/picker";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "../../api/client";
import { addWorkout, getActivities, type Activities } from "../../api/workouts";
import { Button, ChoiceGroup, FormGroup, Input } from "../../ui/components";
import { shortDate } from "../home/dates";
import { parseNumber } from "../food/amounts";

type Props = {
  /** The day to add to (YYYY-MM-DD); null is today. */
  date?: string | null;
  onAdded: () => void;
  onBack: () => void;
};

/** Minutes offered on the wheel: every 5 up to 2 h, every 15 up to 4 h, then every 30. */
export function minuteOptions(max: number): number[] {
  const options: number[] = [];
  for (let m = 5; m <= max; m += m < 120 ? 5 : m < 240 ? 15 : 30) {
    options.push(m);
  }
  return options;
}

const INTENSITIES = [
  { value: "light", label: "Light", detail: "Easy, you could chat" },
  { value: "moderate", label: "Moderate", detail: "Steady effort" },
  { value: "hard", label: "Hard", detail: "Breathing hard" },
];

/** Log a workout: pick the activity and minutes on wheels, say how hard, add. */
export function WorkoutScreen({ date = null, onAdded, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [choices, setChoices] = useState<Activities | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string>("");
  const [minutes, setMinutes] = useState(30);
  const [intensity, setIntensity] = useState("moderate");
  const [calories, setCalories] = useState("");
  const [adding, setAdding] = useState(false);
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

  async function add() {
    if (caloriesBad) return;
    setAdding(true);
    setProblem(null);
    try {
      await addWorkout({
        activity,
        minutes,
        intensity,
        ...(typed !== null ? { calories: typed } : {}),
        ...(date ? { loggedOn: date } : {}),
      });
      onAdded();
    } catch (error) {
      setProblem(
        error instanceof ApiError ? error.message : "Could not add that.",
      );
      setAdding(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Button title="Back" onPress={onBack} secondary />
      <Text style={styles.title} accessibilityRole="header">
        Add a workout
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
          <FormGroup label="What did you do, and for how long?">
            <View style={styles.wheels}>
              <Picker
                style={styles.activity}
                accessibilityLabel="Activity"
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
              <Picker
                style={styles.minutes}
                accessibilityLabel="Minutes"
                selectedValue={minutes}
                onValueChange={(value: number) => setMinutes(value)}
              >
                {minuteOptions(choices.max_minutes).map((value) => (
                  <Picker.Item
                    key={value}
                    label={`${value} min`}
                    value={value}
                  />
                ))}
              </Picker>
            </View>
          </FormGroup>

          <FormGroup label="How hard was it?">
            <ChoiceGroup
              label="Intensity"
              choices={INTENSITIES}
              value={intensity}
              onChange={setIntensity}
            />
          </FormGroup>

          <FormGroup
            label="Calories from your watch (optional)"
            help="Leave empty and the app estimates from your weight, the activity, the time and how hard it was."
            error={
              caloriesBad
                ? "Enter a number above 0, or leave empty."
                : undefined
            }
          >
            <Input
              value={calories}
              onChangeText={setCalories}
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
            title={date ? `Add to ${shortDate(date)}` : "Add to today"}
            onPress={() => void add()}
            disabled={adding || caloriesBad || activity === ""}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingHorizontal: 20 },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111111",
    marginTop: 16,
    marginBottom: 8,
  },
  wheels: { flexDirection: "row" },
  activity: { flex: 5 },
  minutes: { flex: 3 },
  error: { fontSize: 15, color: "#b00020", marginBottom: 8 },
});
