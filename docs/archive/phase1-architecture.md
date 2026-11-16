> **Archived.** This is the phase-1 *proposal*, written before the backend and frontend existed. It is kept for history; it does **not** describe the current system. See ../architecture.md.

# Architecture

> **Status.** The engine (`src/edison_puzzle`), tests and TypeScript types exist and are tested.
> The FastAPI backend and the React frontend below are **proposals**: nothing in this document
> about them has been implemented or run. FastAPI is not installed in the project environment.

## Layers

```
React + TS + Vite   (not started; waits on product design)
        │  JSON over HTTP, types in shared/types/
FastAPI backend     (proposed)  thin: validation, limits, serialisation
        │  plain Python calls
Engine              (done)      src/edison_puzzle – no web or UI imports
```

The dependency rule: the engine imports nothing from FastAPI or any UI code; the backend depends on the engine; the frontend depends only on `shared/types` and HTTP.

## Repository layout

```
src/edison_puzzle/   engine (done)
tests/               pytest suite (done)
shared/types/        TypeScript contract types (done, no build tooling yet)
legacy/              (phase-1 plan only: a local, unpublished copy of the upstream files; not in this repository)
docs/                these documents
backend/             (proposed) FastAPI app, added in the backend phase
frontend/            (not started)
```

Commands (from the repo root):

```
python3 -m venv .venv && .venv/bin/pip install pytest
.venv/bin/pytest                # 171 fast tests (~0.4 s)
.venv/bin/pytest -m slow        # 2 slow tests (~80 s) incl. exhaustive search of the original puzzle
```

## Proposed backend structure

```
backend/app/
  main.py            FastAPI app, CORS for the Vite dev origin, error handlers
  schemas.py         Pydantic request/response models mirroring shared/types/api.ts
  routes/puzzles.py  the five endpoints
  services/
    puzzle_store.py  PuzzleRepository (interface) + InMemoryPuzzleRepository
    solving.py       runs the engine under limits, shapes the response
```

Responsibilities:

| Concern | Design |
|---|---|
| **Puzzle management** | A `PuzzleRepository` with `list/get/add`. Seeded at start-up with `original_puzzle()` (read-only, `builtIn: true`). User puzzles live in memory and are lost on restart; a SQLite implementation can replace it without touching routes. Ids for new puzzles are server-generated. |
| **Puzzle configuration** | `PuzzleConfig.from_dict` already enforces positive integers and unique ids and raises `PuzzleConfigError`, which the API maps to 422. The API adds *size limits* (proposed: board ≤ 100×100, ≤ 30 pieces) because search cost is exponential in piece count. Area mismatch is **allowed** at creation and surfaced as `areaBalanced: false`. |
| **Solver execution** | Endpoints are plain `def`, so FastAPI runs them in its thread pool. The solver is CPU-bound; a semaphore caps concurrent solves (proposed: 2) and returns 429 when saturated. Every request runs under server-enforced `maxNodes` / `timeLimitSeconds` (proposed defaults 2 M nodes / 10 s; hard caps 5 M / 30 s). Client values are clamped, not trusted. |
| **Algorithm events** | Returned inline for small runs. `events: "none" | "milestones" | "full"` maps to `trace=False/True`; `maxEvents` (default 20 000, hard cap 50 000) truncates and sets `eventsTruncated`. The engine yields events lazily, so a later SSE endpoint can stream the same objects without engine changes. |
| **Solution validation** | Stateless: `validate_solution(puzzle, placements)`. An invalid arrangement is a normal 200 with `valid: false` and a list of coded errors, not an HTTP error. |
| **Solution retrieval** | v1: solutions are returned in the solve response; nothing is persisted. Because the solver is deterministic, results could later be cached keyed by `(puzzleId, options)`. A `GET /api/puzzles/{id}/solutions` resource is deliberately deferred. |

## Frontend integration

`shared/types/edison.ts` and `api.ts` are the contract. They were checked against actual engine output: `tsc --strict` compiles them, and each interface's keys equal the keys the Python `to_dict()` emits (one-off script; see roadmap about making this a CI check). `SolverEvent` is a discriminated union on `type`; each step event carries a full state snapshot, so a UI can scrub to any event or render it alone. The playback model (play/pause/step, speed) is a frontend concern and is intentionally not decided here.

## Decisions and trade-offs

* **Events are snapshots, not diffs.** Simpler for consumers and random access; costs memory (each step event holds ≤ 12 placements for the original puzzle). Revisit for large puzzles.
* **Collapsing identical pieces** changes what "N solutions" means (see algorithm-design.md). It must be explained wherever solution counts are shown.
* **No persistence, no auth, no queue** in v1: none is needed for a single-user exploration tool, and adding them would be speculative.
