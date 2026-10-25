import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, type } from "./theme";

/** A plain back arrow drawn from shapes, so no font or emoji can change how it looks. */
function BackArrow() {
  return (
    <View style={styles.arrow} accessibilityElementsHidden>
      <View style={styles.arrowLine} />
      <View style={styles.arrowHead} />
    </View>
  );
}

/** A small date line, the big title, and (optionally) the Calendar button on the right. */
export function ScreenHeader({
  title,
  subtitle,
  onCalendar,
  pastDay = false,
  onToday,
}: {
  title: string;
  subtitle?: string;
  onCalendar?: () => void;
  /** True when the screen shows a day other than today: the date turns orange. */
  pastDay?: boolean;
  /** Shown with a "Back to today" button while pastDay is true. */
  onToday?: () => void;
}) {
  return (
    <>
      <View style={styles.row}>
        <View style={styles.text}>
          {subtitle ? (
            <Text style={[styles.subtitle, pastDay && styles.subtitlePast]}>
              {subtitle}
            </Text>
          ) : null}
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
      {pastDay && onToday ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to today"
          onPress={onToday}
          style={styles.today}
        >
          <BackArrow />
          <Text style={styles.todayText}>Back to today</Text>
        </Pressable>
      ) : null}
    </>
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
  subtitlePast: { color: colors.accent, fontWeight: "600" },
  today: {
    alignSelf: "flex-start",
    minHeight: 36,
    paddingHorizontal: 16,
    marginTop: -4,
    marginBottom: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
  },
  arrow: { width: 16, height: 14, marginRight: 8, justifyContent: "center" },
  arrowLine: {
    position: "absolute",
    left: 1,
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  arrowHead: {
    position: "absolute",
    left: 1,
    width: 9,
    height: 9,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.accent,
    transform: [{ rotate: "45deg" }],
  },
  todayText: { fontSize: 14, fontWeight: "600", color: colors.accent },
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
