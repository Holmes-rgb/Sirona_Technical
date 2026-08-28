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

## Layout mirrors the project-manager repo

Structure follows my existing SvelteKit + DRF project so the muscle memory carries
over:

  * `api/models/`, `api/serializers/`, `api/views/` as packages split by domain, each
    re-exporting from `__init__.py` so callers import from `api.views` and never need
    to know which module something lives in.
  * `src/lib/config.ts` for the API base URL.
  * `src/lib/api/` with one module per resource, imported as `$lib/api`.
  * `+page.server.ts` load functions for data needed on first paint.

Three things were deliberately *not* carried over, and each is a considered change
rather than an oversight:

**Responses are checked before being parsed.** The older code did `return await
res.json()` with no status check, so a 400 or 500 flowed on as if it were data and
surfaced later as a confusing undefined. Failures now raise `ApiError`.

**CRUD goes on a router, not one URL per verb.** The older API used RPC-style paths
(`/tasks/add/`, `/tasks/delete/`, POST for everything). ViewSets on a `DefaultRouter`
generate the standard REST URLs from one registration, so there is less to write and
the HTTP verbs mean what they normally mean. `@api_view` functions are still the right
tool for non-CRUD operations — auth, actions spanning models, reports — and the auth
endpoints use them.

**Responses go through serializers.** Some older views built response dicts by hand
in a comprehension. That drifts out of sync with the model silently and gives no
validation on input.

## One API client module

Every request goes through `frontend/src/lib/api/client.ts`. Cross-cutting concerns — JSON
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

## No auth

The brief requires no authentication, so there is none. The scaffold originally had
Django session auth wired through both halves; it was removed before any feature work
started, so nothing on the critical path is something the spec didn't ask for.

Two details worth knowing, because they are not obvious:

- `DEFAULT_AUTHENTICATION_CLASSES` is set to an explicit `[]`, not omitted. DRF's own
  default is `[SessionAuthentication, BasicAuthentication]`, so omitting it switches
  session auth back *on*. That matters because `/admin/` is still enabled: anyone
  logged into admin in the same browser would have their session cookie authenticate
  API calls, and `SessionAuthentication` then enforces CSRF — producing a 403 that
  reproduces only for whoever visited admin, and never in a fresh browser.
- With no `SessionAuthentication`, the API has no CSRF check at all. DRF wraps every
  view in `csrf_exempt` (`rest_framework/views.py`) and CSRF is enforced solely by
  that class. So `client.ts` sends no tokens, no cookies, and a write is one round
  trip. `CsrfViewMiddleware` stays in `MIDDLEWARE` for the admin's own forms.

## The completion invariant

`a parent is complete exactly when every one of its sub-todos is complete`

Lives on the model (`api/models/todos.py`), as `Todo.toggle()` and
`Todo.recalculate_completed()`. Views translate HTTP to a domain call and shape the
response; they hold no rules.

Three implementation details worth being able to defend:

- **`completed` is read-only on the serializer.** This is what makes the invariant
  enforceable at all: `toggle()` becomes the only path that can change completion
  state, so no plain PATCH can mark a parent done while its children are not. It also
  makes exposing PATCH for inline title editing safe.
- **`recalculate_completed()` uses `.exists()`, not a Python `all()`.** One indexed
  EXISTS query instead of loading every child. It also deliberately no-ops for a
  childless todo — "all zero children are done" is vacuously true and would be wrong.
- **No `select_for_update()`.** SQLite has `has_select_for_update = False` and the
  query compiler raises `NotSupportedError`. `transaction.atomic()` is the right tool
  here; on Postgres the parent row would be locked so two sibling sub-todos toggled
  concurrently can't race on the recalculation.

## Testing

`pytest-django` with `--reuse-db`, which skips recreating the test database between
runs — the difference between a two-second and a sub-second feedback loop.

Vitest is split into two projects. The `server` project (plain Node) runs `*.spec.ts`
— logic and the API client. The `client` project runs `*.svelte.spec.ts` against real
Chromium via Playwright, so component tests exercise actual DOM and events rather than
a jsdom approximation. `npm run test` runs both; `npx vitest run --project server`
runs the Node ones alone when a sub-second loop matters.

Chromium is already installed locally. On a fresh machine the client project needs
`npx playwright install chromium` first.

---

## Log

<!-- Append during the build: one line per real decision. -->
