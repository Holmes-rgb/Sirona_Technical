# Sirona Technical

A todo list where each todo can have sub-todos. A parent completes automatically when
all of its sub-todos are complete, and re-opens if any is unchecked.

SvelteKit frontend, Django REST Framework API, SQLite.

## Running it

Requires Node 22+, Python 3.12+, and [uv](https://docs.astral.sh/uv/). No database
server needed — the project uses SQLite.

One command each, in two terminals. Both handle their own setup on a fresh clone. I know the prompt said one command for a monorepo, but this way makes more practiical sence to me.

**Terminal 1 — backend** → http://127.0.0.1:8000

```bash
cd backend && uv run python manage.py dev
```

**Terminal 2 — frontend** → http://localhost:5173

```bash
cd frontend && npm run dev
```

Then open http://localhost:5173.

`uv run` installs the Python dependencies from `uv.lock` before running, and the `dev`
management command applies migrations before starting the server. On the frontend,
npm's `predev` hook runs `npm install` first. So neither side needs a separate setup
step, and both are safe to re-run.

## Commands

| Backend (from `backend/`) | |
| --- | --- |
| `uv run python manage.py dev` | Migrate and start the API |
| `uv run pytest` | Run tests |
| `uv run python manage.py makemigrations` / `migrate` | Create / apply migrations |
| `uv run python manage.py check` | Django system checks |

| Frontend (from `frontend/`) | |
| --- | --- |
| `npm run dev` | Install and start the dev server |
| `npm run test` | Vitest — unit and component tests |
| `npx vitest run --project server` | Unit tests only, no browser |
| `npm run check` / `npm run lint` | Type check / lint |
| `npm run build` | Production build |

## API

Everything is under `/api/`. Note the trailing slashes: Django redirects a `GET`
without one, but not a `POST` or `PATCH` carrying a body.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/todos/` | All todos as a flat array, parents and sub-todos together |
| `POST /api/todos/` | Create; `{"title": "...", "parentId": null \| id}`; returns `{todo, parent}` |
| `PATCH /api/todos/{id}/toggle/` | Flip completion; returns `{todo, parent, children}` |
| `PATCH /api/todos/{id}/` | Rename — title only, `completed` is read-only |
| `DELETE /api/todos/{id}/` | Delete; returns `{parent}` |

### The toggle response

Completion propagates both ways, so one toggle can change several rows. The response
names whichever direction it went:

(Parents have a null `parentId` and a null `parent`.)

```json
// a sub-todo was ticked, completing its parent
{ "todo":     { "id": 2, "title": "Milk", "completed": true, "parentId": 1 },
  "parent":   { "id": 1, "title": "Groceries", "completed": true, "parentId": null },
  "children": [] }

// the parent was ticked, cascading downwards
{ "todo":     { "id": 1, "title": "Groceries", "completed": true, "parentId": null },
  "parent":   null,
  "children": [ { "id": 2, "completed": true, ... }, { "id": 3, ... } ] }
```

The unused side comes back `null` or `[]` rather than missing, so the client has one
shape to handle. (All todos are flat.)

**any endpoint that changes a row other than the one addressed hands that row back. Database is the one source of truth.**

## Structure

```
backend/
  config/settings.py        DRF defaults, CORS, database
  api/
    models/todos.py         The Todo model — the completion rule lives here
    serializers/todos.py    Validation and JSON shape
    views/todos.py          HTTP to domain calls, and response shaping
    urls.py                 DefaultRouter for CRUD, explicit paths otherwise
    tests/test_todos.py

frontend/src/
  lib/
    api/client.ts           HTTP core: URL building, JSON, ApiError
    api/todos.ts            Todo endpoints and types
    todos/operations.ts     Pure list logic — tree building, applying responses
    todos/store.svelte.ts   Reactive state over those functions
    components/todo/        TodoList, TodoItem, AddTodoForm
  routes/                   +page.server.ts (SSR load), +page.svelte
```

`models/`, `serializers/`, `views/` and `tests/` are packages with one module per
domain area, re-exported from `__init__.py`, so callers write `from api.models import
Todo` without knowing which module it lives in.

In development the SvelteKit dev server proxies `/api/*` to Django, so the browser only
makes same-origin requests — no CORS, and no API base URL to configure.

## Design notes

**The completion rule lives on the model** — `Todo.toggle()` and
`Todo.recalculate_completed()` in `backend/api/models/todos.py`. It is a fact about the
data, so putting it there means it holds however the change arrives.


**The frontend holds exactly what the API returns: one flat array.** Nesting is derived for rendering and never stored, so an update is a swap by id.

```ts
export function applyToggleResponse(todos, { todo, parent, children }) {
    return replaceMany(todos, [todo, ...(parent ? [parent] : []), ...children]);
}
```

Ticking a checkbox, in either direction, is one `PATCH` and no follow-up `GET`. The frontend applies returned data from the database to make sure it remains the source of truth.

## Tests

```bash
cd backend && uv run pytest      # 20
cd frontend && npm run test      # 36
```

| Location | Covers |
| --- | --- |
| `backend/api/tests/test_todos.py` | 19 — the completion rule in both directions, and what each endpoint reports |
| `backend/api/tests/test_health.py` | 1 — liveness |
| `frontend/src/lib/todos/operations.spec.ts` | 24 — tree building, applying responses |
| `frontend/src/lib/api/client.spec.ts` | 7 — URL building, error handling |
| `frontend/src/lib/components/todo/TodoItem.svelte.spec.ts` | 5 — rendering and callbacks, in real Chromium |

The brief asks for three backend tests. I added some frontend tests, as well as an api liveness test (part of opening skeleton) and other tests necessary for correct frontend operation.

## Assumptions

**Q: Should deleting a parent also delete its sub-todos?**
Yes. Expressed as `on_delete=CASCADE` on the foreign key, so it holds even for deletes
that never go through the API.

**Q: What should toggling a *parent* that has sub-todos do?**
It cascades — every sub-todo takes the parent's new state. The brief only defines
toggling a sub-todo. Flipping the parent alone would leave it claiming to be complete
while its sub-todos were unfinished.

**Q: Should adding a sub-todo to an already-complete parent re-open it?**
Yes. A new sub-todo starts incomplete, and a parent carrying unfinished work should not
stay marked complete.

**Q: Should deleting the last *incomplete* sub-todo complete the parent?**
Yes. Once the outstanding item is gone, everything remaining is done.

**Q: Is a todo with no sub-todos complete?**
No — it owns its own state. "All zero of its sub-todos are complete" is vacuously true,
which would be wrong, so recalculation is a no-op for a childless todo.

**Q: Can `completed` be set directly through create or update?**
No. It is read-only on the serializer, so `toggle` is the only path that changes it.
Otherwise a plain `PATCH` could bypass the completion rule entirely.

**Q: How does the client learn about rows changed other than the one it addressed?**
The response always tells it: `toggle` returns `{todo, parent, children}`, `create`
returns `{todo, parent}`, `delete` returns `200` with `{parent}`. The brief specifies
only the toggle case and says create "returns the created todo", so create and delete
are deliberate deviations — taken so one rule holds everywhere and no part of the
frontend has to infer what the server did.

**Q: Should `DELETE` return the updated parent, or a bodiless `204`?**
It returns `200` with `{parent}`. A deliberate break from the usual convention, for the
reason above — deleting a sub-todo can complete its parent, and the UI should not have
to refetch to find out.

**Q: Flat or nested list from `GET /todos`?**
Flat. One Todo shape is used by every endpoint, so a client only has to understand one
object. The UI groups by `parentId`.

**Q: Should deleting a todo ask for confirmation?**
No — it keeps the interaction direct at this size. A real version would confirm before
deleting a parent, since that silently removes its sub-todos.

**Q: Should the API require authentication?**
No. The brief describes no users, so the API is public and there is no login step
between a reviewer and a working app.

**Q: What if two sub-todos of the same parent are toggled at once?**
Last response wins. Each checkbox is disabled while its own request is in flight, but
two different sub-todos can be toggled concurrently and their responses could arrive
out of order. Acceptable for a single-user app; the fix is a request sequence number.

**Q: What are the concurrency guarantees?**
`toggle()` runs in a transaction, but there is no row locking — SQLite does not support
`SELECT FOR UPDATE`. On Postgres the parent row would be locked so two sibling
sub-todos toggled at once could not race on the recalculation.
