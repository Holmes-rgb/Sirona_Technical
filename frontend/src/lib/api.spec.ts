/**
 * Tests for the API client.
 *
 * These stub `fetch` rather than hitting a live backend, so they run in milliseconds
 * and stay green whether or not Django is up. The point is to pin down the client's
 * contract -- what it sends, and how it reports failure.
 */

import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

/** Builds a fake fetch that returns one canned response and records its arguments. */
function stubFetch(body: unknown, status = 200) {
	return vi.fn(
		async () =>
			new Response(body === null ? '' : JSON.stringify(body), {
				status,
				headers: { 'Content-Type': 'application/json' }
			})
	);
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

	it('throws ApiError carrying the DRF validation body', async () => {
		const fetch = stubFetch({ name: ['This field is required.'] }, 400);

		// rejects().toThrowError gives us the typed error object to assert against,
		// which keeps `error` narrowed to ApiError rather than unknown.
		const error = await api.post('/things/', {}, { fetch }).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ApiError);
		const apiError = error as ApiError;
		expect(apiError.status).toBe(400);
		expect(apiError.isValidationError).toBe(true);
		expect(apiError.body).toEqual({ name: ['This field is required.'] });
	});

	it('returns undefined for 204 rather than failing to parse an empty body', async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 204 }));

		await expect(api.del('/things/1/', { fetch })).resolves.toBeUndefined();
	});
});
