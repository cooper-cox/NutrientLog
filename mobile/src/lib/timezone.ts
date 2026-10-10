/** The phone's time zone name (e.g. "America/Los_Angeles"), or UTC if it can't be found. */
export function getTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
