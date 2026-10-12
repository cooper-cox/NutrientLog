import { useEffect, useState } from 'react';

import { getLimits, type Limits } from '../../api/limits';

const MAX_FAILURES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * The server's limits, fetched when the survey opens (and retried a couple of times if the first
 * attempt fails). While they are missing, `limits` is null and the survey does only the basic
 * checks; the server still checks everything when the survey is saved. `unavailable` turns true
 * once the retries have run out, so the screen can say so.
 */
export function useLimits(): { limits: Limits | null; unavailable: boolean } {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    if (limits !== null || failures >= MAX_FAILURES) return;

    let stillWanted = true;
    const attempt = () => {
      getLimits().then(
        (found) => {
          if (stillWanted) setLimits(found);
        },
        () => {
          if (stillWanted) setFailures((count) => count + 1);
        },
      );
    };

    if (failures === 0) {
      attempt();
      return () => {
        stillWanted = false;
      };
    }
    const timer = setTimeout(attempt, RETRY_DELAY_MS * failures);
    return () => {
      stillWanted = false;
      clearTimeout(timer);
    };
  }, [limits, failures]);

  return { limits, unavailable: limits === null && failures >= MAX_FAILURES };
}
