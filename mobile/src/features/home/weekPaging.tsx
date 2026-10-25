import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Dimensions,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { shiftDate, shortDate, weekStart } from "./dates";

/** How many weeks back the chart can be dragged (more if the open day is older). */
export const WEEKS_BACK = 26;

/** The Sundays that start each page, oldest first, ending with the week that holds today. */
export function weekStarts(day: string, today: string): string[] {
  const latest = weekStart(today);
  let first = shiftDate(latest, -7 * (WEEKS_BACK - 1));
  const own = weekStart(day);
  if (own < first) first = own;
  const starts: string[] = [];
  for (let s = first; s <= latest; s = shiftDate(s, 7)) starts.push(s);
  return starts;
}

export function weekTitle(start: string, today: string): string {
  return start === weekStart(today)
    ? "This week"
    : `Week of ${shortDate(start)}`;
}

// Roughly the width inside a card, used until the real width is measured.
const GUESS = Dimensions.get("window").width - 2 * 20 - 2 * 18;

/**
 * A chart you can drag sideways: earlier weeks to the left, today's week last. The page follows
 * the finger, can be held halfway, and always settles on one whole Sunday-to-Saturday week.
 * Weeks load as they come near and stay loaded.
 */
export function WeekPager({
  day,
  today,
  renderHead,
  renderWeek,
}: {
  day: string;
  today: string;
  /** The card's heading row, given the title of the week that is showing. */
  renderHead: (title: string) => ReactNode;
  /** The chart for the week ending on `end` (a Saturday). */
  renderWeek: (end: string) => ReactNode;
}) {
  const starts = useMemo(() => weekStarts(day, today), [day, today]);
  const target = starts.indexOf(weekStart(day));
  const [width, setWidth] = useState(GUESS);
  const [current, setCurrent] = useState(target);
  const [loaded, setLoaded] = useState<number[]>([target]);
  const scroller = useRef<ScrollView>(null);
  const settled = useRef(target);

  // Opening a day in another week (from the calendar) moves the pager there.
  useEffect(() => {
    scroller.current?.scrollTo({ x: target * width, animated: false });
    settled.current = target;
  }, [target, width]);

  function follow(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    const clamped = Math.max(0, Math.min(starts.length - 1, index));
    if (clamped === settled.current) return;
    settled.current = clamped;
    setCurrent(clamped);
    // Load the week being shown and the ones next to it, so a drag finds them ready.
    setLoaded((have) => {
      const want = [clamped - 1, clamped, clamped + 1].filter(
        (i) => i >= 0 && i < starts.length && !have.includes(i),
      );
      return want.length ? [...have, ...want] : have;
    });
  }

  const shownStart =
    starts[Math.min(current, starts.length - 1)] ?? starts[target];
  const nearTarget = [target - 1, target, target + 1];

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== width) setWidth(w);
      }}
    >
      {renderHead(weekTitle(shownStart, today))}
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={follow}
        contentOffset={{ x: target * width, y: 0 }}
        accessibilityHint="Swipe sideways for other weeks"
      >
        {starts.map((start, i) => (
          <View key={start} style={{ width }}>
            {loaded.includes(i) || nearTarget.includes(i)
              ? renderWeek(shiftDate(start, 6))
              : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
