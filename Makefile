PY ?= .venv/bin/python
PIP ?= .venv/bin/pip
PORT ?= 8000
.PHONY: setup run dev-api dev-web lint typecheck test test-slow e2e check format build clean

setup:
	python3 -m venv .venv
	$(PIP) install -e ".[dev]"
	cd frontend && npm ci && npx playwright install chromium

build:
	cd frontend && npm run build

run: build
	$(PY) -m uvicorn edison_api.main:app_factory --factory --host 127.0.0.1 --port $(PORT)

dev-api:
	$(PY) -m uvicorn edison_api.main:app_factory --factory --reload --port $(PORT)

dev-web:
	cd frontend && npm run dev

lint:
	.venv/bin/ruff check src tests scripts
	.venv/bin/ruff format --check src tests scripts
	.venv/bin/mypy
	cd frontend && npm run lint && npm run format:check

typecheck:
	.venv/bin/mypy
	cd frontend && npm run typecheck

test:
	.venv/bin/pytest
	cd frontend && npm test

test-slow:
	.venv/bin/pytest -m slow

e2e:
	cd frontend && npm run e2e

check: lint typecheck test

format:
	.venv/bin/ruff format src tests scripts
	cd frontend && npm run format

clean:
	rm -rf frontend/dist frontend/test-results var .pytest_cache .mypy_cache .ruff_cache
