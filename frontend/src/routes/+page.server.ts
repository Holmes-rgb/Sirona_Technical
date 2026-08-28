/**
 * Server-side load function.
 *
 * Runs on the server before the page renders, so data arrives with the HTML instead
 * of after a client round trip. This is the pattern to reach for on any page that
 * needs data on first paint; fetch from a component only for things triggered by user
 * interaction.
 *
 * Two details that matter:
 *
 *  - The `fetch` SvelteKit passes in is used, not the global one. It forwards the
 *    incoming request's cookies, so the Django session travels with a server-side
 *    call. The global `fetch` has no cookie jar and would arrive unauthenticated.
 *
 *  - The relative '/api' base URL works here as well as in the browser: SvelteKit
 *    resolves it against the app's own origin, which routes back through the Vite
 *    proxy to Django.
 */

import { ApiError, checkSession } from '$lib/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const session = await checkSession({ fetch });
		return { session, apiReachable: true };
	} catch (error) {
		// A failure here means the API is unreachable, which is a scaffold problem
		// rather than an application one. Render the page and report it, rather than
		// throwing a 500 that hides the cause.
		return {
			session: { authenticated: false, user: null },
			apiReachable: false,
			apiError:
				error instanceof ApiError
					? `API responded ${error.status}`
					: 'Could not reach the API — is the Django server running?'
		};
	}
};
