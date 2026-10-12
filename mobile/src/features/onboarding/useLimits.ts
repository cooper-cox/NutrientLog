import { useEffect, useState } from 'react';

import { getLimits, type Limits } from '../../api/limits';

/**
 * The server's limits, fetched once when the survey opens. Until they arrive (or if the server
 * can't be reached) this is null and the survey does only the basic checks; the server still
 * checks everything when the survey is saved.
 */
export function useLimits(): Limits | null {
  const [limits, setLimits] = useState<Limits | null>(null);

  useEffect(() => {
    let stillWanted = true;
    getLimits().then(
      (found) => {
        if (stillWanted) setLimits(found);
      },
      () => {
        // Ignored on purpose, see above.
      },
    );
    return () => {
      stillWanted = false;
    };
  }, []);

  return limits;
}
