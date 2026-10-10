import { ApiError } from '../../api/client';
import { getCurrentGoal, getProfile, type Goal, type Profile } from '../../api/users';
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
