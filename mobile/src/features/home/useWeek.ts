import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import { getWeek, type Week } from "../../api/food";

export type WeekState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; week: Week };

/** The seven days ending on `end` (today when null). Reloads when `reloadKey` changes. */
export function useWeek(reloadKey: number, end: string | null) {
  const [state, setState] = useState<WeekState>({ kind: "loading" });
  const latest = useRef(0);

  const load = useCallback(() => {
    const run = ++latest.current;
    getWeek(end ?? undefined)
      .then((week) => {
        if (run === latest.current) setState({ kind: "ready", week });
      })
      .catch((error: unknown) => {
        if (run !== latest.current) return;
        const message =
          error instanceof ApiError
            ? error.message
            : "Could not load the week.";
        setState({ kind: "error", message });
      });
  }, [end]);

  useEffect(() => {
    load();
    return () => {
      latest.current += 1;
    };
  }, [load, reloadKey]);

  return { state, reload: load };
}
