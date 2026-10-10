import { useCallback, useEffect, useRef, useState } from 'react';

import { getDatabaseHealth, getHealth } from '../../api/health';

export type CheckState =
  | { kind: 'loading' }
  | { kind: 'ok'; detail: string }
  | { kind: 'error'; message: string };

type ServerHealth = {
  api: CheckState;
  database: CheckState;
  /** Run both checks again. */
  refresh: () => void;
  isChecking: boolean;
};

const LOADING: CheckState = { kind: 'loading' };

function messageFrom(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Something went wrong.';
}

/** Asks the server if it is up and if it can reach its database. Runs once on start. */
export function useServerHealth(): ServerHealth {
  const [api, setApi] = useState<CheckState>(LOADING);
  const [database, setDatabase] = useState<CheckState>(LOADING);

  // Each check gets a number. If a newer check has started (or the screen is gone), an older
  // check's answer is ignored, so a slow reply can never overwrite a fresher one.
  const latestRun = useRef(0);

  const startCheck = useCallback(() => {
    const run = ++latestRun.current;

    void Promise.allSettled([getHealth(), getDatabaseHealth()]).then(([apiResult, dbResult]) => {
      if (run !== latestRun.current) return;
      setApi(
        apiResult.status === 'fulfilled'
          ? { kind: 'ok', detail: apiResult.value.status }
          : { kind: 'error', message: messageFrom(apiResult.reason) },
      );
      setDatabase(
        dbResult.status === 'fulfilled'
          ? { kind: 'ok', detail: dbResult.value.database }
          : { kind: 'error', message: messageFrom(dbResult.reason) },
      );
    });
  }, []);

  // Called when the screen goes away: any answer still on its way is ignored.
  const ignoreLateAnswers = useCallback(() => {
    latestRun.current += 1;
  }, []);

  const refresh = useCallback(() => {
    setApi(LOADING);
    setDatabase(LOADING);
    startCheck();
  }, [startCheck]);

  // The state already starts as "loading", so the first check only needs to be started.
  useEffect(() => {
    startCheck();
    return ignoreLateAnswers;
  }, [startCheck, ignoreLateAnswers]);

  return {
    api,
    database,
    refresh,
    isChecking: api.kind === 'loading' || database.kind === 'loading',
  };
}
