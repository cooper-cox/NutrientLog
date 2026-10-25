import { useMemo, useState, type ReactNode } from "react";
import { PanResponder, View } from "react-native";

import { shiftDate, shortDate, weekStart } from "./dates";

const SWIPE_PX = 40;

/**
 * Which week a bar chart shows. It starts on the week of the open day; swiping moves it by whole
 * weeks, back as far as you like but never past the week that holds the real today.
 */
export function useWeekPaging(day: string, today: string) {
  // The shift belongs to the day it was made on: opening another day starts from that day's week.
  const [paged, setPaged] = useState({ day, shift: 0 });
  const shift = paged.day === day ? paged.shift : 0;

  const start = shiftDate(weekStart(day), 7 * shift);
  const latest = weekStart(today);
  const canGoLater = start < latest;

  function move(weeks: number) {
    const next = shiftDate(weekStart(day), 7 * (shift + weeks));
    if (next <= latest) setPaged({ day, shift: shift + weeks });
  }

  return {
    /** The Saturday that ends the shown week, for asking the server. */
    end: shiftDate(start, 6),
    title: start === latest ? "This week" : `Week of ${shortDate(start)}`,
    canGoLater,
    earlier: () => move(-1),
    later: () => move(1),
  };
}

/** Wraps a chart: swiping right shows the week before, swiping left the week after. */
export function SwipeWeeks({
  onEarlier,
  onLater,
  children,
}: {
  onEarlier: () => void;
  onLater: () => void;
  children: ReactNode;
}) {
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only a clearly sideways drag; taps and up-down scrolling are left alone.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx > SWIPE_PX) onEarlier();
          else if (g.dx < -SWIPE_PX) onLater();
        },
      }),
    [onEarlier, onLater],
  );
  return <View {...responder.panHandlers}>{children}</View>;
}
