/**
 * The single entry point for every HTTP call to the Django API.
 *
 * Routing all requests through one module means cross-cutting concerns -- error
 * handling, JSON encoding, auth headers, CSRF -- are implemented once rather than
 * being copy-pasted into each component. When something needs to change (adding a
 * bearer token, say), it changes here and nowhere else.
 */

/**
 * Requests use a relative path so they are same-origin in the browser:
 *  - dev:  Vite proxies /api -> http://127.0.0.1:8000 (see vite.config.ts)
 *  - prod: a reverse proxy serves the frontend and API under one domain
 *
 * PUBLIC_API_BASE_URL can override this if the API ever lives on another origin.
 */
const BASE_URL = '/api';

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

	/** True for 400/422 -- the cases a form should render inline rather than as a toast. */
	get isValidationError(): boolean {
		return this.status === 400 || this.status === 422;
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

interface RequestOptions {
	fetch?: FetchLike;
	/** Appended as a query string; null/undefined entries are dropped. */
	params?: Record<string, string | number | boolean | null | undefined>;
	signal?: AbortSignal;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
	const url = `${BASE_URL}${path}`;
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
 * Every other function in this file delegates here, so this is the only place that
 * needs to know how the API reports success or failure.
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
