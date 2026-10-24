import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "./theme";

export type TabName = "home" | "food" | "workout" | "profile";

export const TABS: { name: TabName; label: string }[] = [
  { name: "home", label: "Home" },
  { name: "food", label: "Food" },
  { name: "workout", label: "Workout" },
  { name: "profile", label: "Profile" },
];

/** The four tabs along the bottom. The active one is orange, with a small bar above it. */
export function TabBar({
  active,
  onChange,
}: {
  active: TabName;
  onChange: (tab: TabName) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { paddingBottom: insets.bottom + 8 }]}
    >
      {TABS.map((tab) => {
        const on = tab.name === active;
        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(tab.name)}
            style={styles.tab}
          >
            <View style={[styles.mark, on && styles.markOn]} />
            <Text style={[styles.label, on && styles.labelOn]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.tabBar,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, minHeight: 48 },
  mark: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: "transparent",
    marginBottom: 8,
  },
  markOn: { backgroundColor: colors.accent },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted },
  labelOn: { color: colors.accent },
});
