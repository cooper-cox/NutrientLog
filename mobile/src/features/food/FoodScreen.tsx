import { useRef, useState } from "react";
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Goal } from "../../api/endpoints";
import { Button } from "../../ui/components";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { colors } from "../../ui/theme";
import { dayLabel, shortDate } from "../home/dates";
import { DayEntries } from "../home/DayEntries";
import { useDay } from "../home/useDay";
import { kcalText } from "./amounts";
import { AddFoodScreen } from "./AddFoodScreen";
import { NutritionPage } from "./NutritionPage";

type Props = {
  goal: Goal;
  /** Changes after something is added, so the day reloads. */
  reloadKey: number;
  /** The day to add to and show (YYYY-MM-DD); null is today. */
  date: string | null;
  onCalendar: () => void;
  /** Called after food is added, edited or removed, so other screens reload. */
  onChanged: () => void;
};

/** Food: search or add a food, see what was eaten, and swipe left for the nutrition facts. */
export function FoodScreen({
  goal,
  reloadKey,
  date,
  onCalendar,
  onChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState<null | "search" | "manual">(null);
  const { state, reload, remove, changeAmount } = useDay(reloadKey, date);
  const day = state.kind === "ready" ? state.day : null;

  if (adding) {
    return (
      <AddFoodScreen
        date={date}
        start={adding}
        onAdded={() => {
          setAdding(null);
          onChanged();
        }}
        onBack={() => setAdding(null)}
      />
    );
  }

  function goTo(next: number) {
    setPage(next);
    pager.current?.scrollTo({ x: next * width, animated: true });
  }
  function settle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  const label = day ? dayLabel(day.date, day.today) : "today";
  const isToday = date === null || (day !== null && day.date === day.today);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <ScreenHeader
          title={page === 0 ? "Food" : "Nutrition"}
          subtitle={`Adding to ${day ? shortDate(day.date) : "today"}`}
          onCalendar={onCalendar}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            page === 0 ? "Show nutrition facts" : "Show your foods"
          }
          onPress={() => goTo(page === 0 ? 1 : 0)}
          style={styles.dots}
        >
          {page === 1 ? (
            <Text style={styles.hint}>Swipe right for your foods</Text>
          ) : null}
          <View style={[styles.dot, page === 0 && styles.dotOn]} />
          <View style={[styles.dot, page === 1 && styles.dotOn]} />
          {page === 0 ? (
            <Text style={styles.hint}>Swipe left for nutrition facts</Text>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={settle}
        style={styles.pager}
      >
        <View style={{ width }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
          >
            <Pressable
              accessibilityRole="search"
              accessibilityLabel="Search foods"
              onPress={() => setAdding("search")}
              style={styles.search}
            >
              <Text style={styles.searchText}>
                {'Search foods, like "greek yogurt"'}
              </Text>
            </Pressable>
            <View style={styles.pair}>
              <View style={styles.pairItem}>
                <Button
                  title="Add by hand"
                  onPress={() => setAdding("manual")}
                  secondary
                />
              </View>
              <View style={styles.pairItem}>
                <Button
                  title="Scan barcode · soon"
                  onPress={() => undefined}
                  disabled
                  secondary
                />
              </View>
            </View>

            {state.kind === "loading" ? (
              <ActivityIndicator style={styles.spinner} />
            ) : null}
            {state.kind === "error" ? (
              <View>
                <Text style={styles.error} accessibilityRole="alert">
                  {state.message}
                </Text>
                <Button title="Try again" onPress={reload} secondary />
              </View>
            ) : null}
            {day ? (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>
                    {isToday ? "Eaten today" : `Eaten ${label}`}
                  </Text>
                  <Text style={styles.total}>
                    {kcalText(day.totals.calories ?? 0)}
                  </Text>
                </View>
                <DayEntries
                  day={day}
                  label={label}
                  isToday={isToday}
                  remove={async (id) => {
                    await remove(id);
                    onChanged();
                  }}
                  changeAmount={async (id, text) => {
                    await changeAmount(id, text);
                    onChanged();
                  }}
                />
              </View>
            ) : null}
          </ScrollView>
        </View>
        <View style={{ width }}>
          {day ? (
            <NutritionPage day={day} goal={goal} />
          ) : (
            <Text style={styles.empty}>
              Nutrition shows once the day has loaded.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20 },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    marginTop: -10,
    marginBottom: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface2,
    marginHorizontal: 4,
  },
  dotOn: { width: 18, backgroundColor: colors.accent },
  hint: { fontSize: 12, color: colors.muted, marginHorizontal: 4 },
  pager: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  search: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  searchText: { fontSize: 15, color: colors.muted },
  pair: { flexDirection: "row", marginTop: 6, marginBottom: 8 },
  pairItem: { flex: 1, marginHorizontal: 4 },
  spinner: { marginTop: 24 },
  error: { fontSize: 16, color: colors.danger, marginVertical: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    marginTop: 8,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  cardTitle: { fontSize: 19, fontWeight: "600", color: colors.text },
  total: { fontSize: 13, color: colors.muted },
  empty: {
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    marginTop: 40,
  },
});
