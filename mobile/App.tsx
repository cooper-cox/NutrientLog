import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HealthScreen } from './src/features/health/HealthScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <HealthScreen />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
