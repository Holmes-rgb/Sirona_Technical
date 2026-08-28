/**
 * Tests for the API client.
 *
 * These stub `fetch` rather than hitting a live backend, so they run in milliseconds
 * and stay green whether or not Django is up. The point is to pin down the client's
 * contract: what it sends, and how it reports failure.
 */

import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client';

/** Builds a fake fetch returning one canned response, recording its arguments. */
function stubFetch(body: unknown, status = 200) {
	return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		void url;
		void init;
		return new Response(body === null ? '' : JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	});
}

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

	it('sends a write in a single request, with no CSRF bootstrap', async () => {
		// The API has no authentication, so DRF applies no CSRF check. A write should
		// therefore be exactly one round trip and carry no X-CSRFToken header.
		const fetch = stubFetch({ id: 1 }, 201);

		await api.post('/things/', { name: 'x' }, { fetch });

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' });
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

	it('exposes no field errors for a non-validation failure', async () => {
		const fetch = stubFetch({ detail: 'Not found.' }, 404);

		const error = (await api.get('/things/1/', { fetch }).catch((e: unknown) => e)) as ApiError;

		expect(error.isValidationError).toBe(false);
		expect(error.fieldErrors).toBeNull();
	});

	it('returns undefined for 204 rather than failing to parse an empty body', async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 204 }));

		await expect(api.del('/things/1/', { fetch })).resolves.toBeUndefined();
	});

	it('surfaces the status when the body is an HTML error page, not a SyntaxError', async () => {
		const fetch = vi.fn(
			async () => new Response('<html>500</html>', { status: 500 })
		) as unknown as typeof globalThis.fetch;

		const error = (await api.get('/things/', { fetch }).catch((e: unknown) => e)) as ApiError;

		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(500);
	});
});
