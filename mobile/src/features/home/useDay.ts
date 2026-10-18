import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import { deleteLogEntry, getDay, type Day } from "../../api/food";

export type DayState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; day: Day };

/** Today's log from the server, with a way to reload it and to remove an entry. */
export function useDay(reloadKey: number) {
  const [state, setState] = useState<DayState>({ kind: "loading" });
  const latest = useRef(0);

  const load = useCallback(() => {
    const run = ++latest.current;
    getDay()
      .then((day) => {
        if (run === latest.current) setState({ kind: "ready", day });
      })
      .catch((error: unknown) => {
        if (run !== latest.current) return;
        const message =
          error instanceof ApiError ? error.message : "Could not load today.";
        setState({ kind: "error", message });
      });
  }, []);

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

  return { state, reload: load, remove };
}
