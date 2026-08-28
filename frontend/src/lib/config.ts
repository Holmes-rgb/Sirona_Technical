/**
 * Frontend configuration.
 */

/**
 * Base URL for every API call.
 *
 * Deliberately relative. In the browser, Vite proxies /api to Django (see
 * vite.config.ts), so requests are same-origin: no CORS preflight, and session
 * cookies are sent without any SameSite configuration.
 *
 * It also works from `+page.server.ts` load functions -- SvelteKit resolves a
 * relative path against the app's own origin, which lands back on the dev server and
 * through the same proxy. (Verified, not assumed: a server-side fetch of
 * '/api/health/' returns 200.) That is why there is no separate SSR base URL here.
 *
 * In production a reverse proxy serves the frontend and API under one domain, so the
 * same relative path keeps working unchanged.
 */
export const API_URL = '/api';
