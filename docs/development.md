# Development setup

Requirements: Python ≥ 3.11 (developed on 3.14), Node ≥ 20 (developed on 24), npm.

## From a fresh clone
```bash
make setup          # creates .venv, installs the package + dev tools, runs npm ci, installs the Playwright browser
make run            # builds the frontend, then serves API + UI at http://127.0.0.1:8000
```
Manual equivalent:
```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
cd frontend && npm ci && npx playwright install chromium && npm run build && cd ..
.venv/bin/python -m uvicorn edison_api.main:app_factory --factory --port 8000
```
Open http://127.0.0.1:8000.

## Day-to-day
```bash
make dev-api        # API on :8000 with reload
make dev-web        # Vite on :5173, proxies /api to :8000 (use this URL while developing the UI)
```

## Configuration (environment variables)
| Variable | Default | Meaning |
|---|---|---|
| `EDISON_DB` | `var/edison.sqlite3` | SQLite file (directory is created) |
| `EDISON_FRONTEND_DIST` | `frontend/dist` | built frontend to serve; if `index.html` is absent only the API is served |

Server limits (nodes, time, events, concurrency) are constants in `src/edison_api/config.py`.

## Quality commands
| Command | Runs |
|---|---|
| `make check` | everything below except E2E |
| `make lint` | `ruff check`, `ruff format --check`, `mypy` (backend); `eslint`, `prettier --check` (frontend) |
| `make typecheck` | `mypy` and `tsc --noEmit` |
| `make test` | `pytest` (backend, ~5 s) and `vitest` (frontend, ~3 s) |
| `make test-slow` | exhaustive search of the original puzzle (~80 s) |
| `make e2e` | builds the frontend, starts the real server on a throw-away database, runs Playwright (≈ 90 s) |
| `make run PORT=8001` | same as `make run` on another port (default 8000) |
| `npm run screenshots` (in `frontend/`) | regenerates `docs/screenshots/*.png` from a running server on :8000. It creates attempts, so run the server with `EDISON_DB` pointing at a throw-away database. Pass a third argument (a frames folder) to also capture the Explorer frames, then `sh scripts/make-explorer-gif.sh <frames> ../docs/screenshots/explorer.gif` (needs `ffmpeg`) builds the GIF |
| `make format` | `ruff format` + `prettier --write` |

## Regenerating data
* `python scripts/generate_original_solutions.py` (~65 s): re-runs the exhaustive search and rewrites `src/edison_puzzle/data/original_solutions.json`. Needed only if the engine or puzzle definition changes; tests check the file.
* `python scripts/generate_frontend_fixtures.py`: rewrites the solver trace fixture used by the frontend replay tests.

## Layout
```
src/edison_puzzle/   engine            tests/            pytest (backend + contract)
src/edison_api/      FastAPI app       frontend/src/     React app (+ *.test.ts[x])
shared/types/        TS contract       frontend/e2e/     Playwright
scripts/             data generators   docs/             documentation
```
