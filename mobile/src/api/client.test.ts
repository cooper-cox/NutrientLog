import { ApiError, apiGet } from './client';

const BASE = 'http://192.168.1.5:8000';
const originalFetch = globalThis.fetch;

function reply(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function mockFetch(implementation: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = jest.fn(implementation);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

describe('apiGet', () => {
  it('asks for JSON from the right address and returns the reply', async () => {
    const fetchMock = mockFetch(async () => reply({ status: 'ok' }));

    await expect(apiGet('/health', { baseUrl: BASE })).resolves.toEqual({ status: 'ok' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://192.168.1.5:8000/health');
    expect(init?.headers).toEqual({ Accept: 'application/json' });
  });

  it('turns a server error into an ApiError that carries the status', async () => {
    mockFetch(async () => reply({ detail: 'nope' }, 503));

    const failure = await apiGet('/health/db', { baseUrl: BASE }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(503);
    expect((failure as ApiError).message).toContain('503');
  });

  it('turns a network failure into a friendly message', async () => {
    mockFetch(async () => {
      throw new TypeError('Network request failed');
    });

    await expect(apiGet('/health', { baseUrl: BASE })).rejects.toThrow('Could not reach the server.');
  });

  it('does not show raw technical errors to the user', async () => {
    mockFetch(async () => {
      throw new TypeError('Network request failed');
    });

    const failure = await apiGet('/health', { baseUrl: BASE }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).not.toContain('Network request failed');
  });

  it('gives up if the server takes too long', async () => {
    jest.useFakeTimers();
    mockFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const outcome = apiGet('/health', { baseUrl: BASE, timeoutMs: 1000 }).catch(
      (error: unknown) => error,
    );
    jest.advanceTimersByTime(1000);

    const failure = await outcome;
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe('The server took too long to respond.');
  });

  it('reports a reply it cannot read', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }) as unknown as Response);

    await expect(apiGet('/health', { baseUrl: BASE })).rejects.toThrow(
      'The server sent a reply the app could not read.',
    );
  });
});
