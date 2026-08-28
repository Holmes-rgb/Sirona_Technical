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
    views/           health.py, auth.py — one module per domain area
    tests/           Mirrors views/
    urls.py          Router for CRUD, explicit paths for everything else
frontend/
  src/lib/config.ts         API base URL
  src/lib/api/
    client.ts               HTTP core: errors, CSRF, credentials
    auth.ts                 Resource module — the template for new ones
    index.ts                Re-exports; components import from '$lib/api'
  src/lib/components/ui/    shadcn-svelte components
  src/routes/               Pages (SvelteKit file-based routing)
```

## Authentication

Django session auth. To create a throwaway login for testing:

```bash
cd backend && uv run python manage.py shell -c \
  "from django.contrib.auth.models import User; \
   User.objects.create_user('tester', 'tester@example.com', 'pw-12345')"
```

| Endpoint | Purpose |
| --- | --- |
| `GET /api/auth/csrf/` | Issues the CSRF token; call once on startup |
| `POST /api/auth/login/` | Sign in |
| `POST /api/auth/logout/` | Sign out |
| `GET /api/auth/check/` | Current session (200 either way) |

The frontend never handles CSRF by hand — `src/lib/api/client.ts` attaches the token
to every unsafe request and caches it for the session.

## How the two halves connect

The Vite dev server proxies `/api/*` to Django on port 8000
([frontend/vite.config.ts](frontend/vite.config.ts)). The browser only ever makes
same-origin requests, so there is no CORS preflight in development and no API base
URL to configure — client code fetches the relative path `/api/health/`.

`django-cors-headers` is configured as well, for the case where the frontend is
served from a different origin than the API.

See [NOTES.md](NOTES.md) for the reasoning behind the technical decisions.
