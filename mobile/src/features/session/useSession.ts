import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProfileSaved } from '../../api/users';
import { loadSession, type SessionState } from './loadSession';

type Session = {
  state: SessionState;
  /** Try loading again (after an error). */
  retry: () => void;
  /** Use freshly saved answers without asking the server again. */
  setSaved: (saved: ProfileSaved) => void;
};

export function useSession(): Session {
  const [state, setState] = useState<SessionState>({ kind: 'loading' });
  // A newer load, a save, or leaving the app makes any older answer out of date.
  const latestRun = useRef(0);

  const start = useCallback(() => {
    const run = ++latestRun.current;
    void loadSession().then((next) => {
      if (run === latestRun.current) setState(next);
    });
  }, []);

  const ignoreLateAnswers = useCallback(() => {
    latestRun.current += 1;
  }, []);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    start();
  }, [start]);

  const setSaved = useCallback(
    (saved: ProfileSaved) => {
      ignoreLateAnswers();
      setState({ kind: 'ready', profile: saved.profile, goal: saved.goal });
    },
    [ignoreLateAnswers],
  );

  useEffect(() => {
    start();
    return ignoreLateAnswers;
  }, [start, ignoreLateAnswers]);

  return { state, retry, setSaved };
}
