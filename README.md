# Sirona Technical

A todo list where each todo can have sub-todos. A parent completes automatically when
all of its sub-todos are complete, and re-opens if any is unchecked.

SvelteKit frontend, Django REST Framework API, SQLite.

## Running it

Two terminals.

**Terminal 1 — backend** (http://127.0.0.1:8000):

```bash
cd backend
uv sync                              # first time only
uv run python manage.py migrate      # first time, and after model changes
uv run python manage.py runserver 8000
```

**Terminal 2 — frontend** (http://localhost:5173):

```bash
cd frontend
npm install                          # first time only
npm run dev
```

Open http://localhost:5173.

Requires Node 22+, Python 3.12+, and [uv](https://docs.astral.sh/uv/). No database
server is needed — the project uses SQLite.

## Commands

All backend commands run from `backend/`, all frontend commands from `frontend/`.

**Backend**

| Command | Does |
| --- | --- |
| `uv run python manage.py runserver 8000` | Start the API |
| `uv run pytest` | Run tests |
| `uv run python manage.py makemigrations` | Create migrations from model changes |
| `uv run python manage.py migrate` | Apply migrations |
| `uv run python manage.py check` | Django system checks |
| `uv run python manage.py shell` | Shell with models loaded |
| `uv run python manage.py createsuperuser` | Create an admin user |

**Frontend**

| Command | Does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run test` | Vitest: unit + component tests |
| `npx vitest run --project server` | Unit tests only — no browser, fastest |
| `npm run check` | Svelte type checking |
| `npm run lint` / `npm run format` | Lint / auto-format |
| `npm run build` | Production build |

## Architecture

### The two halves

Two servers in development. The SvelteKit dev server proxies `/api/*` to Django
([frontend/vite.config.ts](frontend/vite.config.ts)), so the browser only ever makes
**same-origin** requests: no CORS preflight, no API base URL to configure, and client
code fetches the relative path `/api/todos/`. The same relative path works from
server-side `load` functions too, and in production behind a reverse proxy.

```
browser  ──▶  SvelteKit :5173  ──/api/*──▶  Django :8000  ──▶  SQLite
              (UI + SSR)          proxy       (API + rules)
```

`django-cors-headers` is configured as a fallback for serving the frontend from a
different origin, but nothing in development relies on it.

### Backend

```
backend/
  manage.py
  pyproject.toml            Dependencies (uv) and pytest config
  config/
    settings.py             DRF defaults, CORS, database
    urls.py                 Mounts api.urls under /api/
  api/
    models/todos.py         ★ The Todo model — the completion invariant lives here
    serializers/todos.py    Validation, JSON shape, and what may be written
    views/todos.py          HTTP ↔ domain; shapes the create/toggle/delete responses
    views/health.py         Liveness probe
    urls.py                 DefaultRouter for CRUD, explicit paths otherwise
    admin.py                Todo registered for inspecting rows in /admin/
    migrations/0001_initial.py
    tests/test_todos.py     19 tests, mostly about the invariant
```

Each of `models/`, `serializers/`, `views/` and `tests/` is a **package with one
module per domain area**, re-exported from its `__init__.py`. So callers write
`from api.models import Todo` and never need to know which module it lives in — adding
a second domain means adding a file, not growing a 500-line `models.py`.

| Layer | Responsibility | Must not |
| --- | --- | --- |
| Model | The data, and the rules that are true of it | Know about HTTP |
| Serializer | Validate input, control output, decide what is writable | Contain business rules |
| View | Translate HTTP to a domain call, shape the response | Decide what "complete" means |
| URLs | Routing only | — |

**Rules live at the bottom and nothing above re-implements them.** That is the single
organising idea: `Todo.toggle()` is the only thing that knows what toggling means, so
it behaves identically whether it was reached from the API, the admin, a shell, or a
test.

### Frontend

```
frontend/
  vite.config.ts            Dev proxy /api → :8000; Vitest projects
  src/
    lib/
      config.ts             API base URL (relative, so it works in SSR too)
      api/
        client.ts           HTTP core: URL building, JSON, ApiError
        todos.ts            ★ Todo endpoints and types — the API contract
        index.ts            Re-exports; components import from '$lib/api'
      todos/
        operations.ts       ★ Pure list logic — tree building, applying responses
        operations.spec.ts  24 unit tests, Node only
        store.svelte.ts     Reactive state; thin glue over the two above
      components/
        todo/TodoList.svelte    Renders the derived tree
        todo/TodoItem.svelte    One row — used for parents and sub-todos alike
        todo/TodoItem.svelte.spec.ts  5 component tests, real Chromium
        todo/AddTodoForm.svelte One form — used for top-level and sub-todos alike
        ui/                     shadcn-svelte components
    routes/
      +layout.svelte        Global styles and the toast host
      +page.server.ts       SSR load — the list arrives with the HTML
      +page.svelte          Page shell; owns the store
```

| Layer | Responsibility | Must not |
| --- | --- | --- |
| `api/todos.ts` | Build requests, name the response types | Hold state |
| `todos/operations.ts` | Pure transforms over a flat array | Touch the network or runes |
| `todos/store.svelte.ts` | Hold state, call the API, apply the result | Re-implement the completion rule |
| `components/todo/` | Render, and report what the user did | Fetch anything |

The pure layer exists so the logic that keeps the UI correct can be tested as plain
functions, with no browser and no rendering.

### End to end: ticking the last sub-todo

The most useful thing to trace, because it touches every layer and is where the
interesting behaviour lives. "Groceries" has two sub-todos; "Milk" is already done and
the user ticks "Eggs".

| # | Where | What happens |
| --- | --- | --- |
| 1 | `TodoItem.svelte` | Checkbox fires the `onToggle` callback prop. The row knows nothing else. |
| 2 | `TodoList.svelte` | That callback is `() => store.toggle(child.id)`. |
| 3 | `store.svelte.ts` | Marks the id pending, which disables that one checkbox. |
| 4 | `api/todos.ts` | `toggleTodo(3)` → `PATCH /todos/3/toggle/`, no body. |
| 5 | `api/client.ts` | Builds `/api/todos/3/toggle/` and fetches. No cookies, no CSRF token. |
| 6 | `vite.config.ts` | Proxy forwards to `127.0.0.1:8000` — same-origin, so no preflight. |
| 7 | `api/urls.py` | Router maps the URL to the ViewSet's `toggle` action. |
| 8 | `views/todos.py` | Loads the todo, calls `todo.toggle()`. Decides nothing itself. |
| 9 | `models/todos.py` | **In a transaction:** flips `completed`; sees it is a sub-todo; calls `parent.recalculate_completed()`. |
| 10 | `models/todos.py` | One `EXISTS` query finds no incomplete siblings → saves the parent complete, returns it. |
| 11 | `views/todos.py` | Serialises into `{"todo": …, "parent": …, "children": []}` — here the parent flipped, so `children` is empty. |
| 12 | `store.svelte.ts` | Hands the response to `applyToggleResponse`. |
| 13 | `todos/operations.ts` | Two swaps by id in the flat array; returns a new array. |
| 14 | `store.svelte.ts` | Assigning to `$state` invalidates the `$derived` tree. |
| 15 | Svelte | Re-renders both checkboxes. |

**One request. No refetch.** The client never worked out that the parent should
complete — step 10 did, and step 11 reported it.

### Where the tests are

| Suite | Location | Covers |
| --- | --- | --- |
| Backend | `backend/api/tests/test_todos.py` | 19 tests — the invariant, both directions, and what gets reported |
| Backend | `backend/api/tests/test_health.py` | 1 test — liveness |
| Frontend | `frontend/src/lib/todos/operations.spec.ts` | 24 tests — tree building, applying responses |
| Frontend | `frontend/src/lib/api/client.spec.ts` | 7 tests — URL building, error handling |
| Frontend | `frontend/src/lib/components/todo/TodoItem.svelte.spec.ts` | 5 tests — rendering and callbacks, in real Chromium |

The brief asks for three backend tests. The extra ones cover behaviour the invariant
implies but the brief does not state — adding a sub-todo re-opening a completed parent,
deleting the last incomplete sub-todo completing it, and `completed` being unsettable
through create or update.

## API

All endpoints are under `/api/`. Note the trailing slashes — Django's `APPEND_SLASH`
redirects a GET without one, but **not** a POST or PATCH carrying a body.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/todos/` | All todos, flat array, parents and sub-todos together |
| `POST /api/todos/` | Create; `{"title": "...", "parentId": null \| id}`; returns `{todo, parent}` |
| `PATCH /api/todos/{id}/toggle/` | Flip completion; returns `{todo, parent, children}` |
| `PATCH /api/todos/{id}/` | Rename (title only — `completed` is read-only) |
| `DELETE /api/todos/{id}/` | Delete; returns `{parent}` |
| `GET /api/health/` | Liveness probe |

### Where the completion logic lives

On the model — `Todo.toggle()` and `Todo.recalculate_completed()` in
`backend/api/models/todos.py` — not in the view, the serializer, or the frontend.

The rule is a fact about the data, not about any one way of viewing it. Putting it on
the model means it holds no matter what triggers the change: a REST call, the Django
admin, a shell session, a test. A serializer is presentation. And a frontend that
computes the invariant can get it wrong or simply lie, at which point the stored data
is wrong for every other client too. The server has to be the one that decides.

The views stay thin: translate HTTP to a domain call, shape the response.

### How the toggle response is shaped, and why

Completion propagates **both ways**, so one toggle can change several rows. The
response names whichever direction it went:

```json
// a sub-todo was ticked — it completed its parent
{ "todo":     { "id": 2, "title": "Milk", "completed": true, "parentId": 1 },
  "parent":   { "id": 1, "title": "Groceries", "completed": true, "parentId": null },
  "children": [] }

// the parent was ticked — the cascade ran downwards
{ "todo":     { "id": 1, "title": "Groceries", "completed": true, "parentId": null },
  "parent":   null,
  "children": [ { "id": 2, "completed": true, ... },
                { "id": 3, "completed": true, ... } ] }
```

The unused side comes back `null` or `[]` rather than missing, so there is one shape
for the client to handle.

A response carrying only the toggled todo would leave the client knowingly stale — it
would have to refetch the list or recompute the rest itself, and recomputing is exactly
the duplication that lets client and server disagree. Since the server owns the
invariant, it also has to report everything the invariant changed.

The same rule applies to `DELETE`, which returns `{parent}`, and to `POST`, which
returns `{todo, parent}` because creating an incomplete sub-todo re-opens a completed
parent. **Any endpoint that changes a row other than the one addressed hands that row
back**, so the UI never refetches and never guesses.

> This was the source of a real bug. The parent-to-children cascade wrote to the
> database correctly but was left out of the response, so the UI showed a ticked parent
> above unticked sub-todos until the page was reloaded. The test missed it because it
> asserted on the database via `refresh_from_db()` — it checked persistence, not
> reporting. The tests now assert on the response body.

### How the frontend stays in sync

State holds exactly what the API returns: **one flat array**. Nesting is a `$derived`
projection built for rendering and never stored
(`frontend/src/lib/todos/operations.ts`).

That is what makes the no-refetch requirement straightforward. The server reports a
change by naming the affected rows, so applying a toggle response is two swaps by id:

```ts
export function applyToggleResponse(todos, { todo, parent, children }) {
    return replaceMany(todos, [todo, ...(parent ? [parent] : []), ...children]);
}
```

`replaceMany` indexes the updates by id and makes one pass — a cascade can change any
number of rows, so chaining single replacements would be O(n × m).

There is no tree to walk and no second copy of the data that could drift from the
first. Ticking a checkbox — in either direction — is exactly one `PATCH` and no
follow-up `GET`.

The client never computes whether a parent should be complete. That rule lives on the
server precisely so there is one implementation of it; a copy here would be a second
one, free to disagree.

See **Architecture → Frontend** above for how the layers divide.

`TodoList` is deliberately **not** recursive. The domain is exactly one level deep and
the API rejects anything deeper, so a self-rendering component would advertise a
capability the system does not have.

## Assumptions

Questions the brief left open, and what was assumed to move forward.

**Q: Should deleting a parent also delete its sub-todos?**
Assumption: Yes. Expressed as `on_delete=CASCADE` on the foreign key, so it is a
database constraint rather than application code and holds for deletes that never go
through the API.

**Q: What should toggling a *parent* that has sub-todos do?**
Assumption: It cascades — all its sub-todos take the parent's new state. The brief
only defines toggling a sub-todo. Flipping the parent alone would leave it claiming to
be complete while its sub-todos were unfinished, breaking the invariant until the next
child toggle silently overrode it.

**Q: Should adding a new sub-todo to an already-complete parent re-open it?**
Assumption: Yes. A new sub-todo starts incomplete, and a parent carrying unfinished
work must not stay marked complete.

**Q: Should deleting the last *incomplete* sub-todo complete the parent?**
Assumption: Yes. Once the outstanding item is gone, everything that remains is done.
The parent is captured before the delete and re-derived after.

**Q: Is a todo with no sub-todos complete?**
Assumption: No — it owns its own state. "All zero of its sub-todos are complete" is
vacuously true, which would be the wrong answer, so recalculation is a no-op for a
childless todo.

**Q: Can `completed` be set directly through create or update?**
Assumption: No. It is read-only on the serializer, so `toggle` is the only path that
changes it. Otherwise a plain PATCH could mark a parent complete while its sub-todos
were unfinished and bypass the invariant entirely. This is also what makes exposing
PATCH for inline title editing safe.

**Q: Should `DELETE` return the updated parent, or a bodiless 204?**
Assumption: It returns `200` with `{parent}`. This deviates from the REST convention
deliberately, applying the same principle as toggle: any endpoint that can change a
parent's state hands that parent back, so the UI never has to refetch.

**Q: What happens if two sub-todos of the same parent are toggled at once?**
Assumption: last response wins. Each row's checkbox is disabled while its own request
is in flight, but two *different* sub-todos can be toggled concurrently and their
responses could arrive out of order, each carrying its own snapshot of the parent.
Acceptable for a single-user app; the fix is a request sequence number, or refetching
the parent on conflict.

**Q: How does the client learn about rows changed other than the one it addressed?**
Assumption: the response tells it, always. `toggle` returns `{todo, parent, children}`,
`create` returns `{todo, parent}`, `delete` returns `{parent}`. The brief specifies
only the toggle case and says create "returns the created todo", so create and delete
are deviations — taken so that one rule holds everywhere: **any endpoint that changes
a row other than the one addressed hands that row back**. The alternative is a client
that infers what the server did, which is the duplication this design avoids
throughout. After this there is no place in the frontend that reasons about completion.

**Q: Toggling a parent cascades to its children — how is that reported?**
Assumption: in a `children` array on the toggle response, empty when the toggle went
the other way. The cascade is itself an assumption (above), so reporting it belongs to
the same one. Without it the database and the UI disagree until a reload — which is
exactly what happened before this was added.

**Q: Should deleting a todo ask for confirmation?**
Assumption: no. It keeps the interaction direct for an exercise of this size. A real
version would confirm before deleting a parent, since that silently removes its
sub-todos too.

**Q: Flat or nested list?**
Assumption: Flat. One Todo shape is used by every endpoint — list, create, and both
halves of the toggle response — so a client only ever has to understand one object.
The UI groups by `parentId`.

**Q: Should the API require authentication?**
Assumption: No. The brief describes no users, so the API is public and there is no
login step between a reviewer and a working app.

**Q: What are the concurrency guarantees?**
Assumption: Single-user is sufficient. `toggle()` is wrapped in a transaction, but
there is no row locking — SQLite doesn't support `SELECT FOR UPDATE`. On Postgres the
parent row would be locked so that two sibling sub-todos toggled at once could not
race on the parent's recalculation.

## Further reading

[NOTES.md](NOTES.md) records the reasoning behind the technical decisions —
why SQLite, why the proxy instead of CORS, why auth was removed, and the details of
the completion invariant.
