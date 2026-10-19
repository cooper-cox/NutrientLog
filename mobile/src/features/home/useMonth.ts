import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import { getMonth, type Month } from "../../api/food";

export type MonthState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; month: Month };

/** One calendar month ("2026-10"; null is this month). Reloads when `reloadKey` changes. */
export function useMonth(reloadKey: number, month: string | null) {
  const [state, setState] = useState<MonthState>({ kind: "loading" });
  const latest = useRef(0);

  const load = useCallback(() => {
    const run = ++latest.current;
    getMonth(month ?? undefined)
      .then((loaded) => {
        if (run === latest.current) setState({ kind: "ready", month: loaded });
      })
      .catch((error: unknown) => {
        if (run !== latest.current) return;
        const message =
          error instanceof ApiError
            ? error.message
            : "Could not load the calendar.";
        setState({ kind: "error", message });
      });
  }, [month]);

  useEffect(() => {
    load();
    return () => {
      latest.current += 1;
    };
  }, [load, reloadKey]);

  return { state, reload: load };
}
