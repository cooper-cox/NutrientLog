import { getApiBaseUrl } from '../config';

/** One survey answer the server rejected, e.g. { field: 'height_cm', message: '...' }. */
export type FieldProblem = { field: string; message: string };

/** Something went wrong talking to the server. `message` is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number | undefined;
  /** For rejected answers: the message for each field, so it can be shown under the right box. */
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, status?: number, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export type RequestOptions = {
  /** Override the server address (mainly for tests). */
  baseUrl?: string;
  /** Give up after this many milliseconds. Phones can wait a very long time otherwise. */
  timeoutMs?: number;
  /** The login token, sent as "Authorization: Bearer <token>". */
  token?: string;
  /** Sent as JSON. */
  body?: unknown;
};

type Method = 'GET' | 'POST' | 'PUT';

const DEFAULT_TIMEOUT_MS = 8000;

/** The server's error format is { detail: string, errors?: [{ field, message }] }. */
async function readProblem(
  response: Response,
): Promise<{ detail?: string; fields: Record<string, string> }> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return { fields: {} };
    const { detail, errors } = body as { detail?: unknown; errors?: unknown };
    const fields: Record<string, string> = {};
    if (Array.isArray(errors)) {
      for (const item of errors) {
        const { field, message } = (item ?? {}) as { field?: unknown; message?: unknown };
        if (typeof field === 'string' && typeof message === 'string' && !(field in fields)) {
          fields[field] = message;
        }
      }
    }
    return { detail: typeof detail === 'string' ? detail : undefined, fields };
  } catch {
    return { fields: {} };
  }
}

/**
 * The one place the app talks to the server. Screens call functions in `src/api/`, which call
 * this, so error handling and the server address live in a single spot.
 */
export async function apiRequest<T>(
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const baseUrl = options.baseUrl ?? getApiBaseUrl();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
    if (response.status === 422) {
      const problem = await readProblem(response);
      throw new ApiError(problem.detail ?? 'Some answers need fixing.', 422, problem.fields);
    }
    throw new ApiError(`The server returned an error (${response.status}).`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('The server sent a reply the app could not read.', response.status);
  }
}

export function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return apiRequest<T>('GET', path, options);
}
