import { ApiError, apiGet, apiRequest } from './client';

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
    expect(init?.method).toBe('GET');
  });

  it('sends a JSON body and the login token when given', async () => {
    const fetchMock = mockFetch(async () => reply({ ok: true }, 201));

    await apiRequest('PUT', '/api/v1/users/me/profile', {
      baseUrl: BASE,
      token: 'secret',
      body: { height_cm: 180 },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe('{"height_cm":180}');
    expect(init?.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret',
    });
  });

  it('passes on which answers the server rejected, by field', async () => {
    mockFetch(async () =>
      reply(
        {
          detail: 'Some answers need fixing.',
          errors: [
            { field: 'height_cm', message: 'height must be between 100.0 and 250.0 cm' },
            { field: 'height_cm', message: 'second message for the same field is ignored' },
            { field: 'weight_kg', message: 'weight must be between 30.0 and 300.0 kg' },
          ],
        },
        422,
      ),
    );

    const failure = await apiRequest('PUT', '/x', { baseUrl: BASE }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(422);
    expect((failure as ApiError).message).toBe('Some answers need fixing.');
    expect((failure as ApiError).fieldErrors).toEqual({
      height_cm: 'height must be between 100.0 and 250.0 cm',
      weight_kg: 'weight must be between 30.0 and 300.0 kg',
    });
  });

  it('copes with a 422 whose body is not in the expected format', async () => {
    mockFetch(
      async () =>
        ({
          ok: false,
          status: 422,
          json: async () => {
            throw new SyntaxError('not json');
          },
        }) as unknown as Response,
    );

    const failure = await apiRequest('PUT', '/x', { baseUrl: BASE }).catch((e: unknown) => e);

    expect((failure as ApiError).message).toBe('Some answers need fixing.');
    expect((failure as ApiError).fieldErrors).toEqual({});
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

    await expect(apiGet('/health', { baseUrl: BASE })).rejects.toThrow(
      'Could not reach the server.',
    );
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
    mockFetch(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token');
          },
        }) as unknown as Response,
    );

    await expect(apiGet('/health', { baseUrl: BASE })).rejects.toThrow(
      'The server sent a reply the app could not read.',
    );
  });
});
