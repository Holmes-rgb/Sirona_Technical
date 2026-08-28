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

## Layout

```
backend/
  config/            Django project: settings, root URLs
  api/
    models/          One module per domain area, re-exported from __init__.py
    serializers/     Validation and JSON shaping
    models/todos.py  The Todo model — where the completion invariant lives
    views/           One module per domain area
    tests/           Mirrors views/
    urls.py          Router for CRUD, explicit paths for everything else
frontend/
  src/lib/config.ts         API base URL
  src/lib/api/
    client.ts               HTTP core: URL building, errors, JSON
    todos.ts                Todo endpoints and types
    index.ts                Re-exports; components import from '$lib/api'
  src/lib/todos/
    operations.ts           Pure list logic — tree building, applying responses
    store.svelte.ts         Reactive state over the pure functions
  src/lib/components/todo/  TodoList, TodoItem, AddTodoForm
  src/lib/components/ui/    shadcn-svelte components
  src/routes/               Pages (SvelteKit file-based routing)
```

## API

All endpoints are under `/api/`. Note the trailing slashes — Django's `APPEND_SLASH`
redirects a GET without one, but **not** a POST or PATCH carrying a body.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/todos/` | All todos, flat array, parents and sub-todos together |
| `POST /api/todos/` | Create; `{"title": "...", "parentId": null \| id}` |
| `PATCH /api/todos/{id}/toggle/` | Flip completion; returns `{todo, parent}` |
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

`PATCH /api/todos/{id}/toggle/` returns both objects:

```json
{
  "todo":   { "id": 2, "title": "Milk", "completed": true, "parentId": 1 },
  "parent": { "id": 1, "title": "Groceries", "completed": true, "parentId": null }
}
```

`parent` is `null` when the toggled todo is top-level.

Toggling one sub-todo can change two rows, so a response carrying only the toggled
todo would leave the client knowingly stale — it would have to either refetch the whole
list or recompute the parent itself, and recomputing is exactly the duplication that
lets client and server disagree. Since the server owns the invariant, it also has to
report everything the invariant changed. One request, one response, both checkboxes
correct.

The same reasoning is applied to `DELETE`, which returns `{parent}` for the same
reason — see the assumptions below.

### How the frontend stays in sync

State holds exactly what the API returns: **one flat array**. Nesting is a `$derived`
projection built for rendering and never stored
(`frontend/src/lib/todos/operations.ts`).

That is what makes the no-refetch requirement straightforward. The server reports a
change by naming the affected rows, so applying a toggle response is two swaps by id:

```ts
export function applyToggleResponse(todos, { todo, parent }) {
    const next = replaceTodo(todos, todo);
    return parent ? replaceTodo(next, parent) : next;
}
```

There is no tree to walk and no second copy of the data that could drift from the
first. Ticking a sub-todo is exactly one `PATCH` and no follow-up `GET`.

The client never computes whether a parent should be complete. That rule lives on the
server precisely so there is one implementation of it; a copy here would be a second
one, free to disagree.

Layering keeps the graded logic testable without a browser:

| File | Role |
| --- | --- |
| `src/lib/api/todos.ts` | HTTP calls and types |
| `src/lib/todos/operations.ts` | Pure functions — tree building, applying responses |
| `src/lib/todos/store.svelte.ts` | Reactive state, thin glue over the two above |
| `src/lib/components/todo/` | Presentational — no fetching, no rules |

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

**Q: The create response returns only the new todo — how does the UI learn the parent
re-opened?**
Assumption: it derives it locally. A newly created sub-todo is always incomplete, so a
completed parent can only become incomplete — deterministic, and it avoids widening the
create response beyond what the brief specifies. Toggle and delete, where the outcome
is *not* deterministic, return the parent explicitly.

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

## How the two halves connect

The Vite dev server proxies `/api/*` to Django on port 8000
([frontend/vite.config.ts](frontend/vite.config.ts)). The browser only ever makes
same-origin requests, so there is no CORS preflight in development and no API base
URL to configure — client code fetches the relative path `/api/health/`.

`django-cors-headers` is configured as well, for the case where the frontend is
served from a different origin than the API.

See [NOTES.md](NOTES.md) for the reasoning behind the technical decisions.
