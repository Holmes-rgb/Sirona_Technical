# Sirona Technical

Full-stack application: SvelteKit frontend, Django REST Framework API.

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
    views/           One module per domain area
    tests/           Mirrors views/
    urls.py          Router for CRUD, explicit paths for everything else
frontend/
  src/lib/config.ts         API base URL
  src/lib/api/
    client.ts               HTTP core: URL building, errors, JSON
    index.ts                Re-exports; components import from '$lib/api'
  src/lib/components/ui/    shadcn-svelte components
  src/routes/               Pages (SvelteKit file-based routing)
```

## Authentication

None. The brief requires no authentication, so the API is public and there is no login
step between a reviewer and a working app.

`DEFAULT_AUTHENTICATION_CLASSES` is set to an explicit empty list in
`backend/config/settings.py` rather than omitted — DRF's own default is
`[SessionAuthentication, BasicAuthentication]`, so omitting it would switch session
auth back on. With no `SessionAuthentication` there is no CSRF check on the API
either, because DRF wraps every view in `csrf_exempt` and CSRF is enforced solely by
that class. The frontend client therefore sends no tokens and no cookies.

The Django admin at `/admin/` is still enabled as a development tool for inspecting
data; it has its own login. Create a superuser with
`uv run python manage.py createsuperuser`.

## How the two halves connect

The Vite dev server proxies `/api/*` to Django on port 8000
([frontend/vite.config.ts](frontend/vite.config.ts)). The browser only ever makes
same-origin requests, so there is no CORS preflight in development and no API base
URL to configure — client code fetches the relative path `/api/health/`.

`django-cors-headers` is configured as well, for the case where the frontend is
served from a different origin than the API.

See [NOTES.md](NOTES.md) for the reasoning behind the technical decisions.
