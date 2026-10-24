import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, type } from "./theme";

/** A small date line, the big title, and (optionally) the Calendar button on the right. */
export function ScreenHeader({
  title,
  subtitle,
  onCalendar,
}: {
  title: string;
  subtitle?: string;
  onCalendar?: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {onCalendar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open calendar"
          onPress={onCalendar}
          style={styles.calendar}
        >
          <Text style={styles.calendarText}>Calendar ▾</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    marginBottom: 14,
  },
  text: { flex: 1, paddingRight: 8 },
  subtitle: { fontSize: type.subtitle, color: colors.muted },
  title: {
    fontSize: type.title,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.5,
  },
  calendar: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  calendarText: { fontSize: 14, fontWeight: "600", color: colors.text },
});
