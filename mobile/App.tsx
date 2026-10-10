import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { formFromProfile } from './src/features/onboarding/survey';
import { OnboardingScreen } from './src/features/onboarding/OnboardingScreen';
import { HealthScreen } from './src/features/health/HealthScreen';
import { ResultsScreen } from './src/features/results/ResultsScreen';
import { useSession } from './src/features/session/useSession';
import { Button } from './src/ui/components';

function Screens() {
  const { state, retry, setSaved } = useSession();
  const [editing, setEditing] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);

  if (checkingConnection) {
    return <HealthScreen onBack={() => setCheckingConnection(false)} />;
  }

  switch (state.kind) {
    case 'loading':
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.message}>Loading…</Text>
        </View>
      );
    case 'error':
      return (
        <View style={styles.centered}>
          <Text style={styles.message}>{state.message}</Text>
          <Text style={styles.hint}>
            Is the backend running (docker compose up), and are your phone and computer on the same
            Wi-Fi network?
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
    case 'needs-survey':
      return <OnboardingScreen onSaved={setSaved} />;
    case 'ready':
      return editing ? (
        <OnboardingScreen
          initialForm={formFromProfile(state.profile)}
          onSaved={(saved) => {
            setSaved(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <ResultsScreen
          profile={state.profile}
          goal={state.goal}
          onChangeAnswers={() => setEditing(true)}
          onCheckConnection={() => setCheckingConnection(true)}
        />
      );
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Screens />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  message: { fontSize: 18, color: '#111111', marginTop: 16, textAlign: 'center' },
  hint: { fontSize: 15, color: '#555555', marginTop: 12, textAlign: 'center', lineHeight: 21 },
  buttons: { alignSelf: 'stretch', marginTop: 20 },
});
