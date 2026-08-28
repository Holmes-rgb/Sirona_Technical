# Sirona Technical

Full-stack application: SvelteKit frontend, Django REST Framework API.

## Running it

```bash
make install   # dependencies + database (safe to re-run)
make dev       # backend on :8000, frontend on :5173
```

Open http://localhost:5173.

Requires Node 22+, Python 3.12+, and [uv](https://docs.astral.sh/uv/). No database
server is needed — the project uses SQLite.

## Commands

`make help` lists everything. The ones that matter:

| Command | Does |
| --- | --- |
| `make dev` | Both servers, one terminal |
| `make test` | pytest + vitest |
| `make mm` / `make migrate` | Create / apply migrations |
| `make check` | Django checks + Svelte type checking |
| `make lint` / `make format` | Frontend linting and formatting |

## Layout

```
backend/
  config/      Django project: settings, root URLs
  api/         Application code: models, serializers, views, urls, tests
frontend/
  src/lib/api.ts            Every HTTP call goes through here
  src/lib/components/ui/    shadcn-svelte components
  src/routes/               Pages (SvelteKit file-based routing)
```

## How the two halves connect

The Vite dev server proxies `/api/*` to Django on port 8000
([frontend/vite.config.ts](frontend/vite.config.ts)). The browser only ever makes
same-origin requests, so there is no CORS preflight in development and no API base
URL to configure — client code fetches the relative path `/api/health/`.

`django-cors-headers` is configured as well, for the case where the frontend is
served from a different origin than the API.

See [NOTES.md](NOTES.md) for the reasoning behind the technical decisions.
