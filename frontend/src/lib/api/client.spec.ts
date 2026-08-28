/**
 * Tests for the API client.
 *
 * These stub `fetch` rather than hitting a live backend, so they run in milliseconds
 * and stay green whether or not Django is up. The point is to pin down the client's
 * contract: what it sends, and how it reports failure.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, clearCsrfToken } from './client';

/**
 * Builds a fake fetch returning one canned response, recording its arguments.
 *
 * Answers the CSRF bootstrap separately, because the client fetches a token before
 * any unsafe method -- without this, a POST test would receive its canned error
 * response at the CSRF stage rather than at the call under test.
 */
function stubFetch(body: unknown, status = 200) {
	return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		void init;
		if (String(url).endsWith('/auth/csrf/')) {
			return new Response(JSON.stringify({ csrfToken: 'tok-123' }), { status: 200 });
		}
		return new Response(body === null ? '' : JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	});
}

beforeEach(() => {
	// The token is cached module-wide, so reset it or tests leak state into each other.
	clearCsrfToken();
});

describe('api', () => {
	it('prefixes paths with /api so requests hit the proxy', async () => {
		const fetch = stubFetch({ status: 'ok' });

		await api.get('/health/', { fetch });

		expect(fetch).toHaveBeenCalledWith('/api/health/', expect.anything());
	});

	it('drops empty query params instead of serialising them', async () => {
		const fetch = stubFetch({ results: [] });

		await api.get('/things/', { fetch, params: { q: 'ct', status: null, page: 2 } });

		expect(fetch).toHaveBeenCalledWith('/api/things/?q=ct&page=2', expect.anything());
	});

	it('sends credentials so the session cookie travels with every request', async () => {
		const fetch = stubFetch({ status: 'ok' });

		await api.get('/health/', { fetch });

		expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
	});

	it('throws ApiError carrying the DRF validation body', async () => {
		const fetch = stubFetch({ name: ['This field is required.'] }, 400);

		const error = await api.post('/things/', {}, { fetch }).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ApiError);
		const apiError = error as ApiError;
		expect(apiError.status).toBe(400);
		expect(apiError.isValidationError).toBe(true);
		expect(apiError.fieldErrors).toEqual({ name: ['This field is required.'] });
	});

	it('flags 401 as an auth error rather than a validation one', async () => {
		const fetch = stubFetch({ detail: 'Invalid credentials.' }, 401);

		const error = (await api
			.post('/auth/login/', {}, { fetch })
			.catch((e: unknown) => e)) as ApiError;

		expect(error.isAuthError).toBe(true);
		expect(error.fieldErrors).toBeNull();
	});

	it('returns undefined for 204 rather than failing to parse an empty body', async () => {
		// DELETE is an unsafe method, so the client fetches a CSRF token first; the
		// stub has to answer both calls.
		const fetch = vi.fn(async (url: string | URL | Request) => {
			if (String(url).endsWith('/auth/csrf/')) {
				return new Response(JSON.stringify({ csrfToken: 'tok-123' }), { status: 200 });
			}
			return new Response(null, { status: 204 });
		}) as unknown as typeof globalThis.fetch;

		await expect(api.del('/things/1/', { fetch })).resolves.toBeUndefined();
	});

	it('reports a clear error when the CSRF endpoint returns a non-JSON body', async () => {
		// Django returning an HTML error page here used to surface as an opaque
		// SyntaxError on whatever write triggered it.
		const fetch = vi.fn(
			async () => new Response('<html>500</html>', { status: 500 })
		) as unknown as typeof globalThis.fetch;

		const error = (await api.post('/things/', {}, { fetch }).catch((e: unknown) => e)) as ApiError;

		expect(error).toBeInstanceOf(ApiError);
		expect(error.message).toContain('CSRF token');
	});
});

describe('csrf', () => {
	it('does not fetch a token for safe methods', async () => {
		const fetch = stubFetch({ status: 'ok' });

		await api.get('/health/', { fetch });

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0][0]).toBe('/api/health/');
	});

	it('fetches a token before an unsafe method and sends it as X-CSRFToken', async () => {
		const fetch = vi.fn(async (url: string | URL | Request) => {
			if (String(url).endsWith('/auth/csrf/')) {
				return new Response(JSON.stringify({ csrfToken: 'tok-123' }), { status: 200 });
			}
			return new Response(JSON.stringify({ id: 1 }), { status: 201 });
		}) as unknown as typeof globalThis.fetch;

		await api.post('/things/', { name: 'x' }, { fetch });

		const calls = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
		expect(calls[0][0]).toBe('/api/auth/csrf/');
		expect(calls[1][1].headers).toMatchObject({ 'X-CSRFToken': 'tok-123' });
	});

	it('caches the token so a second write does not re-fetch it', async () => {
		let csrfCalls = 0;
		const fetch = vi.fn(async (url: string | URL | Request) => {
			if (String(url).endsWith('/auth/csrf/')) {
				csrfCalls += 1;
				return new Response(JSON.stringify({ csrfToken: 'tok-123' }), { status: 200 });
			}
			return new Response(JSON.stringify({}), { status: 200 });
		}) as unknown as typeof globalThis.fetch;

		await api.post('/things/', {}, { fetch });
		await api.post('/things/', {}, { fetch });

		expect(csrfCalls).toBe(1);
	});
});
