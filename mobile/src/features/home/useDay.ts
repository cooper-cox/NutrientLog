import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import {
  changeLogEntry,
  deleteLogEntry,
  getDay,
  type Day,
} from "../../api/food";

export type DayState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; day: Day };

/** One day's log (today when `date` is null), with ways to reload, remove and re-amount. */
export function useDay(reloadKey: number, date: string | null) {
  const [state, setState] = useState<DayState>({ kind: "loading" });
  const latest = useRef(0);

  const load = useCallback(() => {
    const run = ++latest.current;
    getDay(date ?? undefined)
      .then((day) => {
        if (run === latest.current) setState({ kind: "ready", day });
      })
      .catch((error: unknown) => {
        if (run !== latest.current) return;
        const message =
          error instanceof ApiError
            ? error.message
            : "Could not load this day.";
        setState({ kind: "error", message });
      });
  }, [date]);

  useEffect(() => {
    load();
    return () => {
      latest.current += 1;
    };
  }, [load, reloadKey]);

  const remove = useCallback(
    async (entryId: string) => {
      try {
        await deleteLogEntry(entryId);
      } catch {
        // The reload below shows what is really there.
      }
      load();
    },
    [load],
  );

  /** Rejects with the reason (shown to the person) if the new amount can't be understood. */
  const changeAmount = useCallback(
    async (entryId: string, text: string) => {
      await changeLogEntry(entryId, text);
      load();
    },
    [load],
  );

  return { state, reload: load, remove, changeAmount };
}
