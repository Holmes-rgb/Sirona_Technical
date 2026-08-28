/**
 * The HTTP core. Every API call in the app goes through here.
 *
 * Routing all requests through one module means cross-cutting concerns -- JSON
 * encoding, error handling, query-string building -- are implemented once rather than
 * copy-pasted into each resource module. When something needs to change, it changes
 * here and nowhere else.
 *
 * Resource modules (todos.ts, ...) sit on top of this and expose named, typed
 * functions. Components import those, never this file directly.
 */

import { API_URL } from '$lib/config';

/**
 * Raised when the API responds with a non-2xx status.
 *
 * Carries the parsed response body, because DRF returns validation errors as a
 * `{ field: [messages] }` object that forms need in order to highlight the offending
 * inputs. A plain `Error` would throw that detail away.
 */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly body: unknown,
		message: string
	) {
		super(message);
		this.name = 'ApiError';
	}

	/** 400/422 -- render these inline on the form rather than as a toast. */
	get isValidationError(): boolean {
		return this.status === 400 || this.status === 422;
	}

	/**
	 * Field errors in the shape a form can consume, or null if this isn't a
	 * validation error. DRF returns `{ field: ["message", ...] }`.
	 */
	get fieldErrors(): Record<string, string[]> | null {
		if (!this.isValidationError || typeof this.body !== 'object' || this.body === null) {
			return null;
		}
		return this.body as Record<string, string[]>;
	}
}

/** Shape of a DRF PageNumberPagination response, for typing paginated endpoints. */
export interface Paginated<T> {
	count: number;
	next: string | null;
	previous: string | null;
	results: T[];
}

/**
 * `fetch` implementation to use. SvelteKit hands `load` functions a special `fetch`
 * that supports SSR and request de-duplication, so pass it in when calling from a
 * load function; the global is the right default everywhere else.
 */
type FetchLike = typeof globalThis.fetch;

export interface RequestOptions {
	fetch?: FetchLike;
	/** Appended as a query string; null/undefined/empty entries are dropped. */
	params?: Record<string, string | number | boolean | null | undefined>;
	signal?: AbortSignal;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
	const url = `${API_URL}${path}`;
	if (!params) return url;

	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		// Skip empty values so an unset filter doesn't become `?status=undefined`.
		if (value !== null && value !== undefined && value !== '') {
			search.append(key, String(value));
		}
	}

	const query = search.toString();
	return query ? `${url}?${query}` : url;
}

/**
 * Performs the request and normalises the response.
 *
 * Every other function here delegates to this, so it is the only place that needs to
 * know how the API reports success or failure.
 *
 * There is no CSRF handling: the API has no authentication, so DRF applies no CSRF
 * check (see the DEFAULT_AUTHENTICATION_CLASSES comment in config/settings.py).
 */
async function request<T>(
	method: string,
	path: string,
	body?: unknown,
	options: RequestOptions = {}
): Promise<T> {
	const doFetch = options.fetch ?? globalThis.fetch;

	const response = await doFetch(buildUrl(path, options.params), {
		method,
		headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: options.signal
	});

	// 204 No Content has no body to parse.
	if (response.status === 204) return undefined as T;

	// Read as text first: an unhandled Django exception returns an HTML error page,
	// and calling .json() on that throws a SyntaxError that hides the real status.
	const text = await response.text();
	let parsed: unknown = null;
	if (text) {
		try {
			parsed = JSON.parse(text);
		} catch {
			parsed = text;
		}
	}

	if (!response.ok) {
		throw new ApiError(response.status, parsed, `${method} ${path} failed with ${response.status}`);
	}

	return parsed as T;
}

export const api = {
	get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),

	post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
		request<T>('POST', path, body, options),

	put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
		request<T>('PUT', path, body, options),

	patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
		request<T>('PATCH', path, body, options),

	del: <T = void>(path: string, options?: RequestOptions) =>
		request<T>('DELETE', path, undefined, options)
};
