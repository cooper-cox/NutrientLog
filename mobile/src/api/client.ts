import { getApiBaseUrl } from '../config';

/** Something went wrong talking to the server. `message` is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type RequestOptions = {
  /** Override the server address (mainly for tests). */
  baseUrl?: string;
  /** Give up after this many milliseconds. Phones can wait a very long time otherwise. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * The one place the app talks to the server. Screens call functions in `src/api/`, which call
 * this, so error handling and the server address live in a single spot.
 */
export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl = options.baseUrl ?? getApiBaseUrl();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError('The server took too long to respond.');
    }
    throw new ApiError('Could not reach the server.');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ApiError(`The server returned an error (${response.status}).`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('The server sent a reply the app could not read.', response.status);
  }
}
