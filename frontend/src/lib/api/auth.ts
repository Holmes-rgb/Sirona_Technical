/**
 * Authentication calls.
 *
 * A resource module: named, typed functions over the HTTP core in client.ts. This is
 * the template for every other resource -- see the commented example in index.ts.
 *
 * Note there is no getCsrf() here. The client handles CSRF for all unsafe methods and
 * caches the token, so resource modules never think about it.
 */

import { api, clearCsrfToken, type RequestOptions } from './client';

export interface User {
	id: number;
	username: string;
	email: string;
}

export interface SessionState {
	authenticated: boolean;
	user: User | null;
}

/** Sign in and start a session. Throws ApiError with status 401 on bad credentials. */
export function login(username: string, password: string, options?: RequestOptions) {
	return api.post<User>('/auth/login/', { username, password }, options);
}

/** End the session. */
export async function logout(options?: RequestOptions): Promise<void> {
	await api.post<void>('/auth/logout/', undefined, options);
	// Django rotates the CSRF token when the session changes, so the cached one is
	// now stale and would be rejected on the next write.
	clearCsrfToken();
}

/**
 * Who is signed in, if anyone.
 *
 * Returns 200 with `authenticated: false` when signed out rather than a 401, so
 * "not logged in" is an ordinary answer rather than an error to catch.
 */
export function checkSession(options?: RequestOptions) {
	return api.get<SessionState>('/auth/check/', options);
}
