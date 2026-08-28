/**
 * Loads the todo list on the server, before the page is sent.
 *
 * Doing this here rather than in an onMount means the list arrives with the HTML
 * instead of after a round trip, so there is no empty flash on first paint.
 *
 * Uses the `fetch` SvelteKit provides rather than the global one -- and the relative
 * '/api' base URL works server-side as well as in the browser, because SvelteKit
 * resolves it against the app's own origin, which routes back through the Vite proxy
 * to Django.
 */

import { ApiError } from '$lib/api';
import { listTodos } from '$lib/api/todos';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		return { todos: await listTodos({ fetch }), loadError: null };
	} catch (error) {
		// Render the page with an explanation rather than throwing a 500. An
		// unreachable API is an environment problem, and a blank error page hides
		// which of the two servers is actually down.
		return {
			todos: [],
			loadError:
				error instanceof ApiError
					? `The API responded ${error.status}.`
					: 'Could not reach the API — is the Django server running?'
		};
	}
};
