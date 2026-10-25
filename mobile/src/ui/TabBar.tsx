import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "./theme";

export type TabName = "home" | "food" | "workout" | "profile";

type IconName = keyof typeof Ionicons.glyphMap;

export const TABS: {
  name: TabName;
  label: string;
  icon: IconName;
  iconOn: IconName;
}[] = [
  { name: "home", label: "Home", icon: "home-outline", iconOn: "home" },
  {
    name: "food",
    label: "Food",
    icon: "restaurant-outline",
    iconOn: "restaurant",
  },
  {
    name: "workout",
    label: "Workout",
    icon: "barbell-outline",
    iconOn: "barbell",
  },
  {
    name: "profile",
    label: "Profile",
    icon: "person-outline",
    iconOn: "person",
  },
];

/** The four tabs along the bottom. Each has an icon over its label; the active one is orange and its icon is filled. */
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
            <Ionicons
              name={on ? tab.iconOn : tab.icon}
              size={26}
              color={on ? colors.accent : colors.muted}
              style={styles.icon}
            />
            <Text style={[styles.label, on && styles.labelOn]}>
              {tab.label}
            </Text>
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
  icon: { marginBottom: 2 },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted },
  labelOn: { color: colors.accent },
});
