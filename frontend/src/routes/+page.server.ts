/**
 * Server-side load function.
 *
 * Runs on the server before the page renders, so data arrives with the HTML instead
 * of after a client round trip. This is the pattern to reach for on any page that
 * needs data on first paint; fetch from a component only for things triggered by user
 * interaction.
 *
 * Note it uses the `fetch` SvelteKit passes in, not the global one -- and that the
 * relative '/api' base URL works here as well as in the browser, because SvelteKit
 * resolves it against the app's own origin, which routes back through the Vite proxy
 * to Django.
 */

import { api, ApiError } from '$lib/api';
import type { PageServerLoad } from './$types';

interface Health {
	status: string;
}

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const health = await api.get<Health>('/health/', { fetch });
		return { apiReachable: true, apiStatus: health.status };
	} catch (error) {
		// A failure here means the API is unreachable, which is a scaffold problem
		// rather than an application one. Render the page and report it, rather than
		// throwing a 500 that hides the cause.
		return {
			apiReachable: false,
			apiStatus: null,
			apiError:
				error instanceof ApiError
					? `API responded ${error.status}`
					: 'Could not reach the API — is the Django server running?'
		};
	}
};
