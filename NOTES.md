# Decisions

Why this project is built the way it is. README.md covers what it does and how to run
it; this file covers the reasoning, and the traps worth knowing about.

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

## The CORS middleware ordering trap

The proxy means CORS never fires in development (README explains the setup).
`django-cors-headers` is still configured for serving the frontend from another
origin, and the ordering in `settings.py` matters: `CorsMiddleware` must sit **above**
`CommonMiddleware`. `CommonMiddleware` can emit redirects, and a redirect that has not
passed through `CorsMiddleware` carries no CORS headers — which surfaces in the browser
as an opaque failure looking nothing like the redirect that caused it.

## Two details in the API client

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

There is none, because the brief describes no users. Two non-obvious consequences:

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

## The bug worth recounting

The parent-to-children cascade was written correctly and persisted correctly —
`sub_todos.update(...)` did exactly what it should. But `toggle()` returned `None` for
a top-level todo, so the response omitted the rows it had just changed. The UI showed a
ticked parent above unticked sub-todos, and a page reload "fixed" it.

The test passed throughout, because it asserted through `refresh_from_db()`. It proved
the write happened and said nothing about whether the client was told. **A test that
reads the database cannot catch a reporting bug.** The tests now assert on the response
body, and the end-to-end check reloads the page after each step to confirm the server
agrees with what the UI was already showing — which distinguishes "the client guessed
right" from "the server said so".

The view's docstring had claimed all along that it "must report everything the
invariant changed". The fix was making the code true to what it already said.

## Testing

`pytest-django` with `--reuse-db`, which skips recreating the test database between
runs — the difference between a two-second and a sub-second feedback loop.

Vitest is split into two projects. The `server` project (plain Node) runs `*.spec.ts`
— the pure list operations and the API client, which is where the logic worth proving
lives. The `client` project runs `*.svelte.spec.ts` in real Chromium via Playwright,
so `TodoItem` is tested against actual DOM and real clicks rather than a jsdom
approximation. `npm run test` runs both; `npx vitest run --project server` runs the
Node ones alone when a sub-second loop matters.

Two things about the browser project:

- It needs `optimizeDeps: { exclude: ['bits-ui'] }`. The shadcn components wrap
  bits-ui, which uses `$effect.pre`; if Vite pre-bundles it, it gets a different Svelte
  runtime instance than the component tree and every effect throws `effect_orphan`.
- A Vitest project matching no files passes silently with exit code 0 — it does not
  fail. So an empty browser project is worse than none: it looks like coverage and
  proves nothing.

Chromium is already installed locally. On a fresh machine the client project needs
`npx playwright install chromium` first.
