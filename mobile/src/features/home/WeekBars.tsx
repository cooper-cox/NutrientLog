import { StyleSheet, Text, View } from "react-native";

import { colors } from "../../ui/theme";

export type Bar = {
  /** Under the bar, e.g. "Tue" or two lines "Tue\n10/20". */
  label: string;
  /** 0 to 1 of the chart height; null for a day that has not happened yet. */
  fraction: number | null;
  /** The highlighted (today) bar is orange. */
  today?: boolean;
};

/** A row of bars with a label under each, an optional dashed target line, and an optional y axis. */
export function WeekBars({
  bars,
  height = 96,
  target = null,
  ticks,
  accessibilityLabel,
}: {
  bars: Bar[];
  height?: number;
  /** A dashed line at this fraction of the height (e.g. the calorie target). */
  target?: number | null;
  /** Labels down the left, top to bottom (e.g. ["60", "30", "0"]). */
  ticks?: string[];
  accessibilityLabel: string;
}) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.plotRow}>
        {ticks ? (
          <View style={[styles.ticks, { height }]}>
            {ticks.map((tick) => (
              <Text key={tick} style={styles.tick}>
                {tick}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={[styles.plot, { height }]}>
          {target !== null ? (
            <View
              style={[styles.target, { bottom: Math.round(height * target) }]}
            />
          ) : null}
          <View style={styles.bars}>
            {bars.map((bar, i) => (
              <View key={i} style={styles.slot}>
                <View
                  style={[
                    styles.bar,
                    {
                      height:
                        bar.fraction === null || bar.fraction <= 0
                          ? 3
                          : Math.max(4, Math.round(bar.fraction * height)),
                    },
                    bar.fraction === null || bar.fraction <= 0
                      ? styles.barEmpty
                      : bar.today
                        ? styles.barToday
                        : styles.barOn,
                  ]}
                />
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={styles.labelRow}>
        {ticks ? <View style={styles.tickSpacer} /> : null}
        <View style={styles.labels}>
          {bars.map((bar, i) => (
            <Text
              key={i}
              style={[
                styles.label,
                bar.today && styles.labelToday,
                bar.fraction === null && styles.labelFuture,
              ]}
            >
              {bar.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plotRow: { flexDirection: "row" },
  ticks: { width: 26, justifyContent: "space-between", marginRight: 8 },
  tick: { fontSize: 11, color: colors.muted, textAlign: "right" },
  tickSpacer: { width: 34 },
  plot: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: "flex-end",
  },
  target: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderTopColor: colors.muted,
  },
  bars: { flexDirection: "row", alignItems: "flex-end", height: "100%" },
  slot: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: 24, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barOn: { backgroundColor: colors.bar },
  barToday: { backgroundColor: colors.accent },
  barEmpty: { backgroundColor: colors.border, opacity: 0.6 },
  labelRow: { flexDirection: "row", marginTop: 6 },
  labels: { flex: 1, flexDirection: "row" },
  label: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted,
  },
  labelToday: { color: colors.accent },
  labelFuture: { opacity: 0.5 },
});
