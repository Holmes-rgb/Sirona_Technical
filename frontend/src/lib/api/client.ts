/**
 * The HTTP core. Every API call in the app goes through here.
 *
 * Routing all requests through one module means cross-cutting concerns -- JSON
 * encoding, error handling, CSRF, credentials -- are implemented once rather than
 * copy-pasted into each resource module. When something needs to change (adding an
 * Authorization header, say), it changes here and nowhere else.
 *
 * Resource modules (tasks.ts, auth.ts, ...) sit on top of this and expose named,
 * typed functions. Components import those, never this file directly.
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

	/** 401/403 -- the user needs to sign in, or isn't allowed. */
	get isAuthError(): boolean {
		return this.status === 401 || this.status === 403;
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

/** Shape of a DRF PageNumberPagination response, for typing list endpoints. */
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

/* -------------------------------------------------------------------------- */
/* CSRF                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Django rejects unsafe requests whose `X-CSRFToken` header doesn't match the
 * `csrftoken` cookie. The token is stable for the session, so it is fetched once and
 * cached rather than re-fetched before every write -- doing it per request doubles
 * the number of round trips for no added safety.
 */
let csrfToken: string | null = null;

/** Reads the token Django set as a cookie, so a page reload doesn't need a fetch. */
function csrfFromCookie(): string | null {
	if (typeof document === 'undefined') return null;
	const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
	return match ? decodeURIComponent(match[1]) : null;
}

/** Fetches and caches the CSRF token, hitting the network at most once per session. */
export async function ensureCsrfToken(doFetch: FetchLike = globalThis.fetch): Promise<string> {
	if (csrfToken) return csrfToken;

	const fromCookie = csrfFromCookie();
	if (fromCookie) {
		csrfToken = fromCookie;
		return csrfToken;
	}

	const response = await doFetch(`${API_URL}/auth/csrf/`, { credentials: 'include' });

	// Guarded for the same reason as in request(): if this endpoint returns anything
	// other than JSON -- an HTML error page, an empty body -- .json() throws a
	// SyntaxError that would surface on the caller's write and point nowhere useful.
	const text = await response.text();
	let token = '';
	if (text) {
		try {
			token = (JSON.parse(text) as { csrfToken?: string }).csrfToken ?? '';
		} catch {
			token = '';
		}
	}

	if (!token) {
		throw new ApiError(response.status, text, 'Could not obtain a CSRF token from /api/auth/csrf/');
	}

	csrfToken = token;
	return csrfToken;
}

/** Drop the cached token. Call after logout, since Django rotates it on session change. */
export function clearCsrfToken(): void {
	csrfToken = null;
}

/** GET/HEAD/OPTIONS/TRACE are safe methods -- Django doesn't require a CSRF token. */
function needsCsrf(method: string): boolean {
	return !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method);
}

/* -------------------------------------------------------------------------- */
/* Request                                                                     */
/* -------------------------------------------------------------------------- */

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
 */
async function request<T>(
	method: string,
	path: string,
	body?: unknown,
	options: RequestOptions = {}
): Promise<T> {
	const doFetch = options.fetch ?? globalThis.fetch;

	const headers: Record<string, string> = {};
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	if (needsCsrf(method)) headers['X-CSRFToken'] = await ensureCsrfToken(doFetch);

	const response = await doFetch(buildUrl(path, options.params), {
		method,
		headers,
		// Send the session cookie. Required even same-origin for `fetch` to include
		// credentials on every request consistently.
		credentials: 'include',
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: options.signal
	});

	// 204 No Content is the normal DELETE response and has no body to parse.
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
