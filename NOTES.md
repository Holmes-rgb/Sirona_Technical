# Decisions

A running log of technical decisions and the reasoning behind them. Add to it while
building — an entry costs thirty seconds and turns "why did you do it that way?" into
something I can point at rather than reconstruct.

---

## Stack

**SvelteKit + Django REST Framework.**
Chosen for familiarity over novelty. In a fixed-time exercise the binding constraint
is how fast I can move in a stack and how well I can explain it afterwards, not the
stack's theoretical ceiling. DRF in particular front-loads a lot: serializers,
pagination, filtering, and the browsable API come free, so most of a CRUD resource is
declaration rather than code.

**Svelte 5 runes mode**, enforced project-wide in `vite.config.ts`. `$state` and
`$derived` make reactivity explicit at the point of declaration, which reads better
than Svelte 4's implicit `let` reactivity when someone else is reading the code cold.

## SQLite, not Postgres

Nothing in the application depends on SQLite — the ORM sits in between, and the
migration files are engine-agnostic. It buys a project that clones and runs with no
service to start and no credentials to manage.

Production would be Postgres, via Supabase. That is a change to the `DATABASES` dict
alone (`dj_database_url.parse(os.environ['DATABASE_URL'])`), plus adding `psycopg`.

The honest caveat: Postgres-only features are off the table while on SQLite — JSONB
operators, full-text search, `ArrayField`. If the problem needs one of those, switching
early is cheaper than working around it.

## Vite proxy instead of CORS

`vite.config.ts` proxies `/api` to `127.0.0.1:8000`. The browser sees same-origin
requests, so no preflight, no `SameSite` cookie problems, and no API base URL in the
client — just relative paths, which work identically in production behind a reverse
proxy.

`django-cors-headers` is still configured for when the frontend is served from a
different origin. Note the middleware ordering in `settings.py`: `CorsMiddleware` must
sit above `CommonMiddleware`, because `CommonMiddleware` can emit redirects and a
redirect that hasn't passed through `CorsMiddleware` carries no CORS headers — which
surfaces in the browser as an opaque failure that looks nothing like its cause.

## One API client module

Every request goes through `frontend/src/lib/api.ts`. Cross-cutting concerns — JSON
encoding, error handling, query-string building, and later auth headers — are
implemented once. Adding a bearer token is a change to one file rather than to every
component that fetches.

Two details worth noting:
- `ApiError` carries the parsed response body, because DRF returns validation errors
  as `{field: [messages]}` and forms need that to highlight the right inputs.
- The response is read as text and then parsed, rather than via `.json()`. An
  unhandled Django exception returns an HTML error page, and calling `.json()` on that
  throws a `SyntaxError` that buries the actual status code.

## Pagination on by default

`PAGE_SIZE: 20` is set globally in `REST_FRAMEWORK` rather than per-view. Opting in
per-view is easy to forget, and an unpaginated list endpoint that works fine against
20 rows falls over at 20,000. The default is the safe direction to fail in.

## Testing

`pytest-django` with `--reuse-db`, which skips recreating the test database between
runs — the difference between a two-second and a sub-second feedback loop.

Vitest is split into two projects. The `server` project (plain Node) runs `*.spec.ts`
— logic and the API client. The `client` project runs `*.svelte.spec.ts` against real
Chromium via Playwright, so component tests exercise actual DOM and events rather than
a jsdom approximation. Both run under `make test`; `make test-unit` runs the Node ones
alone when a sub-second loop matters.

Chromium is already installed locally. On a fresh machine the client project needs
`npx playwright install chromium` first.

---

## Log

<!-- Append during the build: one line per real decision. -->
