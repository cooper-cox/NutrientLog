/** On launch: load this phone's saved session from the server, and the hook the app uses for it. */
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../../api/client';
import { getCurrentGoal, getProfile, type Goal, type Profile, type ProfileSaved } from '../../api/endpoints';
import { clearStoredToken, getStoredToken } from '../../storage/token';

export type SessionState =
  | { kind: 'loading' }
  /** No finished survey yet (first launch, or the server doesn't know this phone's login). */
  | { kind: 'needs-survey' }
  | { kind: 'ready'; profile: Profile; goal: Goal }
  | { kind: 'error'; message: string };

/** On launch: does this phone already have a user with a finished survey? */
export async function loadSession(): Promise<SessionState> {
  const token = await getStoredToken();
  if (!token) return { kind: 'needs-survey' };

  try {
    const profile = await getProfile(token);
    const goal = await getCurrentGoal(token);
    return { kind: 'ready', profile, goal };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) return { kind: 'needs-survey' };
      if (error.status === 401) {
        // The server doesn't recognise the saved login (e.g. the dev database was wiped).
        await clearStoredToken();
        return { kind: 'needs-survey' };
      }
      return { kind: 'error', message: error.message };
    }
    return { kind: 'error', message: 'Something went wrong.' };
  }
}

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
