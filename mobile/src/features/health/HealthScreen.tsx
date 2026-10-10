import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getApiBaseUrl } from '../../config';
import { type CheckState, useServerHealth } from './useServerHealth';

function describe(state: CheckState): string {
  switch (state.kind) {
    case 'loading':
      return 'Checking…';
    case 'ok':
      return `OK (${state.detail})`;
    case 'error':
      return `Problem: ${state.message}`;
  }
}

function StatusRow({ label, state }: { label: string; state: CheckState }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[styles.value, state.kind === 'error' && styles.valueError]}
        accessibilityLabel={`${label}: ${describe(state)}`}
      >
        {describe(state)}
      </Text>
    </View>
  );
}

/**
 * Proves the whole chain works (phone, Wi-Fi, server, database). Reached from the results
 * screen, or from the error screen when the server can't be reached.
 */
export function HealthScreen({ onBack }: { onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const { api, database, refresh, isChecking } = useServerHealth();
  const hasProblem = api.kind === 'error' || database.kind === 'error';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title} accessibilityRole="header">
        NutrientLog
      </Text>
      <Text style={styles.subtitle}>Server connection check</Text>

      <StatusRow label="API" state={api} />
      <StatusRow label="Database" state={database} />

      <Text style={styles.address}>Server address: {getApiBaseUrl()}</Text>

      {hasProblem && (
        <Text style={styles.hint}>
          Is the backend running (docker compose up), and are your phone and computer on the same
          Wi-Fi network?
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isChecking }}
        disabled={isChecking}
        onPress={refresh}
        style={({ pressed }) => [
          styles.button,
          isChecking && styles.buttonDisabled,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>{isChecking ? 'Checking…' : 'Check again'}</Text>
      </Pressable>

      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { paddingHorizontal: 20 },
  title: { fontSize: 32, fontWeight: '700', color: '#111111' },
  subtitle: { fontSize: 18, color: '#555555', marginTop: 4, marginBottom: 28 },
  row: { marginBottom: 20 },
  label: { fontSize: 14, color: '#555555', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 20, color: '#111111', marginTop: 4 },
  valueError: { color: '#b00020' },
  address: { fontSize: 14, color: '#555555', marginTop: 8 },
  hint: { fontSize: 16, color: '#111111', marginTop: 20, lineHeight: 22 },
  button: {
    marginTop: 28,
    minHeight: 48, // comfortably tappable
    borderRadius: 10,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonDisabled: { backgroundColor: '#888888' },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  backButton: { marginTop: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 18, color: '#111111', textDecorationLine: 'underline' },
});
