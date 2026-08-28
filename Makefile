# Project commands.
#
# Everything routes through here so there is one place to look and one set of
# commands to remember. `make dev` is the only one needed most of the time.
#
# .PHONY marks targets that are commands rather than files -- without it, make would
# skip `make test` if a file or directory named "test" happened to exist.

BACKEND  := backend
FRONTEND := frontend

# `uv run` executes inside the backend virtualenv without needing it activated.
PY := cd $(BACKEND) && uv run

.PHONY: help install dev dev-backend dev-frontend test test-backend test-frontend \
        test-unit migrate mm shell superuser lint format check clean

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# --- Setup --------------------------------------------------------------------

install:  ## Install all dependencies and run migrations (safe to re-run)
	cd $(BACKEND) && uv sync
	cd $(FRONTEND) && npm install
	npm install
	$(MAKE) migrate

# --- Development --------------------------------------------------------------

dev:  ## Run backend (:8000) and frontend (:5173) together
	npx concurrently \
		--names "django,svelte" \
		--prefix-colors "green,magenta" \
		--kill-others \
		"$(MAKE) dev-backend" \
		"$(MAKE) dev-frontend"

dev-backend:  ## Run only the Django dev server
	$(PY) python manage.py runserver 8000

dev-frontend:  ## Run only the SvelteKit dev server
	cd $(FRONTEND) && npm run dev

# --- Database -----------------------------------------------------------------

migrate:  ## Apply migrations
	$(PY) python manage.py migrate

mm:  ## Create migrations from model changes
	$(PY) python manage.py makemigrations

superuser:  ## Create a Django admin user
	$(PY) python manage.py createsuperuser

shell:  ## Django shell with models loaded
	$(PY) python manage.py shell

# --- Tests and checks ---------------------------------------------------------

test: test-backend test-frontend  ## Run all tests

test-backend:  ## pytest
	$(PY) pytest

test-frontend:  ## vitest: unit tests plus Svelte component tests in Chromium
	cd $(FRONTEND) && npm run test

test-unit:  ## vitest, unit tests only -- no browser, fastest feedback
	cd $(FRONTEND) && npx vitest run --project server

check:  ## Django system checks + Svelte type checking
	$(PY) python manage.py check
	cd $(FRONTEND) && npm run check

lint:  ## Lint the frontend
	cd $(FRONTEND) && npm run lint

format:  ## Auto-format the frontend
	cd $(FRONTEND) && npm run format

clean:  ## Remove build artefacts and caches
	rm -rf $(FRONTEND)/.svelte-kit $(FRONTEND)/build
	find $(BACKEND) -name __pycache__ -type d -prune -exec rm -rf {} +
	rm -rf $(BACKEND)/.pytest_cache
