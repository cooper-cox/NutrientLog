import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { formFromProfile } from "./src/features/onboarding/survey";
import { OnboardingScreen } from "./src/features/onboarding/OnboardingScreen";
import { HealthScreen } from "./src/features/health/HealthScreen";
import { FoodScreen } from "./src/features/food/FoodScreen";
import { WorkoutScreen } from "./src/features/workout/WorkoutScreen";
import { CalendarOverlay } from "./src/features/home/CalendarOverlay";
import { HomeScreen } from "./src/features/home/HomeScreen";
import { ProfileScreen } from "./src/features/profile/ProfileScreen";
import { useSession } from "./src/features/session/session";
import { Button } from "./src/ui/components";
import { TabBar, type TabName } from "./src/ui/TabBar";
import { colors } from "./src/ui/theme";

function Screens() {
  const { state, retry, setSaved } = useSession();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<TabName>("home");
  const [calendar, setCalendar] = useState(false);
  // Bumped when food or a workout is added, changed or removed, so open screens reload.
  const [changed, setChanged] = useState(0);
  const bump = () => setChanged((count) => count + 1);
  // The day being looked at (YYYY-MM-DD); null is today. Food and Workout add to it.
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);

  if (checkingConnection) {
    return <HealthScreen onBack={() => setCheckingConnection(false)} />;
  }

  switch (state.kind) {
    case "loading":
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.muted} />
          <Text style={styles.message}>Loading…</Text>
        </View>
      );
    case "error":
      return (
        <View style={styles.centered}>
          <Text style={styles.message}>{state.message}</Text>
          <Text style={styles.hint}>
            Is the backend running (docker compose up), and are your phone and
            computer on the same Wi-Fi network?
          </Text>
          <View style={styles.buttons}>
            <Button title="Try again" onPress={retry} />
            <Button
              title="Check server connection"
              onPress={() => setCheckingConnection(true)}
              secondary
            />
          </View>
        </View>
      );
    case "needs-survey":
      return <OnboardingScreen onSaved={setSaved} />;
    case "ready":
      if (editing) {
        return (
          <OnboardingScreen
            initialForm={formFromProfile(state.profile)}
            onSaved={(saved) => {
              setSaved(saved);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        );
      }
      return (
        <View style={styles.app}>
          <View style={styles.body}>
            {tab === "home" ? (
              <HomeScreen
                goal={state.goal}
                reloadKey={changed}
                date={viewDate}
                onCalendar={() => setCalendar(true)}
                onToday={() => setViewDate(null)}
              />
            ) : tab === "food" ? (
              <FoodScreen
                goal={state.goal}
                reloadKey={changed}
                date={viewDate}
                onCalendar={() => setCalendar(true)}
                onToday={() => setViewDate(null)}
                onChanged={bump}
              />
            ) : tab === "workout" ? (
              <WorkoutScreen
                reloadKey={changed}
                date={viewDate}
                onCalendar={() => setCalendar(true)}
                onToday={() => setViewDate(null)}
                onChanged={bump}
              />
            ) : (
              <ProfileScreen
                profile={state.profile}
                goal={state.goal}
                onChangeAnswers={() => setEditing(true)}
                onCheckConnection={() => setCheckingConnection(true)}
              />
            )}
            {calendar ? (
              <CalendarOverlay
                reloadKey={changed}
                goal={state.goal}
                selected={viewDate}
                onPick={setViewDate}
                onClose={() => setCalendar(false)}
              />
            ) : null}
          </View>
          <TabBar
            active={tab}
            onChange={(next) => {
              setTab(next);
              setCalendar(false);
            }}
          />
        </View>
      );
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Screens />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bg,
  },
  message: {
    fontSize: 18,
    color: colors.text,
    marginTop: 16,
    textAlign: "center",
  },
  hint: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 12,
    textAlign: "center",
    lineHeight: 21,
  },
  buttons: { alignSelf: "stretch", marginTop: 20 },
});
