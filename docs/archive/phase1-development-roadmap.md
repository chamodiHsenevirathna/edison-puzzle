> **Archived.** This is the phase-1 *proposal*, written before the backend and frontend existed. It is kept for history; it does **not** describe the current system. See ../development-roadmap.md.

# Development roadmap

## Done (engineering preparation)

* Original code inspected from a local, unpublished copy (`legacy/`, not in this repository); findings in [technical-assessment.md](../technical-assessment.md).
* Engine: board, rotation, validation, solver (one or many solutions), execution events, metrics, limits.
* 171 fast tests + 2 slow tests; bug-injection check (8 mutations, all caught).
* TypeScript contract types in `shared/types/` (`tsc --strict` clean; keys match engine output).
* Architecture and API contracts (proposed).

## Blocked on product design

Do not start until the design is reviewed:

* All frontend screens, layout, visual language, animation and styling.
* Playback model (play/pause/step/scrub, speed) and how much of the event stream a user should see.
* Whether the UI explains "8 solutions = 1 solution + symmetries" or hides symmetry.
* Whether users can create custom puzzles, and what limits to show them.

## Next steps, in order

1. **Review this branch of work** and confirm the event model covers what the design needs (cheap to change now). In particular: whether a "dead end" or "pruned" event is wanted, and whether snapshots-per-event is acceptable.
2. **Backend (FastAPI)** per [phase1-architecture.md](phase1-architecture.md) / [phase1-api-contracts.md](phase1-api-contracts.md): schemas, in-memory repository, five endpoints, limits and concurrency cap, CORS. Test with `TestClient` against the contract examples. Pin dependencies in `pyproject.toml`.
3. **Contract drift check in CI**: turn the one-off script (compare `shared/types` keys with `to_dict()` output) into a test; optionally generate Pydantic or TS from one source.
4. **Frontend scaffold** (Vite + React + TS) once designs exist: import `shared/types`, build a UI-agnostic event-player (reducer over `SolverEvent[]`), then screens from the design.
5. **Streaming**: SSE endpoint from the existing lazy generator, plus cancellation (client disconnect stops the search).
6. **Engine performance, if needed**: dead-space pruning (a free gap narrower than the smallest remaining piece dimension), optional symmetry breaking. Measure first with the node counts in `SolverMetrics`; exhaustive search is currently ~65 s.
7. **Tooling**: linter/type checker (ruff, mypy) and a CI workflow. None is configured today.

## Risks

| Risk | Mitigation |
|---|---|
| User-defined puzzles can make the search run effectively forever | server limits on size, nodes, time; `time_limit`/`node_limit` statuses already exist |
| Large event streams overwhelm the browser | `maxEvents` truncation now; streaming and sampling later |
| "Number of solutions" confuses users (identical pieces and symmetry collapse) | decide in design review; engine can add symmetry breaking |
| Types drift between Python and TypeScript | step 3 |
