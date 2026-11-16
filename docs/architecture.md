# Architecture (as built)

```
Browser: React 19 + TypeScript + Vite           frontend/
   │  REST (JSON) + Server-Sent Events           shared/types/ (contract)
FastAPI app (edison_api)                         src/edison_api/
   │  plain function calls
Engine (edison_puzzle) — no web/UI imports       src/edison_puzzle/
   │
SQLite (stdlib sqlite3, WAL)                     var/edison.sqlite3 (configurable)
```

One deployable: the FastAPI process serves the API **and** the built frontend (with SPA fallback). In development Vite serves the UI and proxies `/api` to the API.

## Engine (`src/edison_puzzle`)

`models` (immutable domain), `board` (bitmask occupancy, undo/copy/restore), `solver` (lazy event generator; `cancel()`, limits), `events` (event dataclasses, compact encoding, replay helper), `validation` (independent tiling checker), `symmetry` (board symmetries and solution families), `analysis` (explains invalid puzzle input), `challenges` (definitions + pure evaluation), `catalog` (built-in puzzles), `data` (packaged exhaustive solutions of the original). See [algorithm-design.md](algorithm-design.md).

## API (`src/edison_api`)

| Module | Role |
|---|---|
| `main.py` | `create_app()` factory, routes, request models (Pydantic, `extra=forbid`), SPA hosting, built-in seeding at start-up |
| `solving.py` | clamps client limits to server caps; concurrency `Slots`; synchronous solve; async SSE stream that cancels the search on disconnect |
| `db.py` | `Store`: SQLite persistence, one short-lived connection per operation |
| `errors.py` | single error envelope `{error:{code,message,details}}` for every failure |
| `config.py` | `Settings` + hard limits; env: `EDISON_DB`, `EDISON_FRONTEND_DIST` |

### Resource management
* Every client limit is **clamped** to a server cap (nodes ≤ 5 M, time ≤ 30 s, events ≤ 200 k; defaults 2 M / 10 s / 50 k).
* At most 2 searches run at once; others get HTTP 429 `solver_busy`.
* Searches are never unbounded: each has node and time limits. The SSE endpoint cancels the search when the client disconnects (checked every 100 ms; the solver stops at the next node). Tested.
* Placement/board input is bounded (placement coordinates/sizes ≤ 1000, ≤ 64 placements, board side ≤ 100, ≤ 30 pieces) so validation is cheap on hostile input.

### Event delivery
`GET /api/puzzles/{id}/solve/stream` sends batches of up to 500 events as SSE `events` frames, then one `done` frame. Events are **compact** by default (no per-event board snapshots): the original puzzle's first-solution trace is 23,291 events, ≈ 3 MB compact versus ≈ 19 MB with snapshots (5.6× smaller). The frontend rebuilds the board by replaying `placement_accepted` (push) / `backtrack_completed` (pop) with a checkpoint every 256 events so scrubbing backwards is cheap. A test replays Python-generated traces through the TypeScript replay and compares every snapshot.

## Frontend (`frontend/src`)

| Folder | Contents |
|---|---|
| `lib/` | pure logic: geometry (placement checks), formatting, storage (safe `localStorage`), preferences context, hooks |
| `game/` | `reducer.ts`: the Playground's whole state machine (pure, ~30 tests) |
| `explorer/` | `replay.ts` (checkpointed replay), `narrate.ts` (event → plain language), `useRecording.ts` (SSE + in-memory cache) |
| `api/` | typed `fetch` client with one `ApiError` type; `stream.ts` SSE wrapper |
| `components/` | `Board` (SVG technical drawing), `PieceTray`, `Results`, charts, shared UI |
| `pages/` | one file per route; route-level code splitting |
| `styles/` | tokens + one hand-written stylesheet (no CSS framework) |

State management is deliberately plain React (`useReducer` + small hooks); there is no global store because no state is shared between pages except via URL, `localStorage` and the server.

## Technology choices (smallest set that completes the product)

FastAPI + uvicorn (async SSE, Pydantic validation), SQLite (zero-ops, adequate for a single-process app), React + Vite + TypeScript, `react-router-dom`, `@fontsource` fonts. Dev tooling: pytest, ruff, mypy, vitest + Testing Library, ESLint, Prettier, Playwright + axe-core. No auth, accounts, cloud services or paid APIs.
