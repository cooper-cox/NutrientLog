import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "../../ui/theme";

/** The first screen: after a few seconds it explains that a sleeping server can be slow. */
export function LoadingScreen({
  slowAfterMs = 6000,
}: {
  slowAfterMs?: number;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [slowAfterMs]);
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.muted} />
      <Text style={styles.message}>Loading…</Text>
      {slow ? (
        <Text style={styles.hint}>
          Waking the server up. After a quiet spell this can take up to a
          minute.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bg,
  },
  message: {
    marginTop: 16,
    fontSize: 18,
    color: colors.text,
    textAlign: "center",
  },
  hint: {
    marginTop: 12,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 21,
  },
});
