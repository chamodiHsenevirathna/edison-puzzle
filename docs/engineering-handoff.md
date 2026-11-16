# Engineering handoff

## Status
| | |
|---|---|
| Implementation | **Complete** for the intended scope (see [product-overview.md](product-overview.md)) |
| Automated verification | **Complete and passing** (see [testing.md](testing.md)) |
| Final human UAT | **Pending** ([uat-checklist.md](uat-checklist.md)) |
| Production deployment | **Pending** ([deployment.md](deployment.md)) |

Nothing has been committed, pushed, published or deployed.

## Where things are
Start with [README.md](../README.md) → [architecture.md](architecture.md) → [api-contracts.md](api-contracts.md) → [algorithm-design.md](algorithm-design.md) → [data-model.md](data-model.md). History: [technical-assessment.md](technical-assessment.md) (analysis of the upstream code), [implementation-assessment.md](implementation-assessment.md) (audit and milestone log), [archive/](archive/) (superseded phase-1 proposals).

## Conventions worth knowing
* The engine never imports web or UI code; keep it that way. The API never reimplements rules; it calls the engine.
* `shared/types` is the only place the wire format is described for TypeScript; `tests/test_contract_types.py` keeps it honest. Add a field on the server → add it there, or CI fails.
* Frontend pure logic lives in `lib/`, `game/`, `explorer/`; pages are thin. The Playground's behaviour is entirely in `game/reducer.ts`.
* Built-in puzzles are code (`catalog.py`) and are re-synced into the DB at each start-up.
* When rendering the board, annotation sizes scale with `max(width,height)/56` and strokes use `vector-effect: non-scaling-stroke`, so any board size looks right.

## Known limitations
**Product / behaviour**
1. Time, action and undo counts are measured in the browser and reported to the server; they can't be verified. Only the arrangement is verified. Challenge results are therefore "honest-mode", not competitive.
2. Progress is per browser (anonymous id). Clearing site data or switching browser starts fresh; there is no sync or accounts.
3. Time only runs between the first action and completion and is not paused when the tab is hidden; a game restored after reload resumes counting at the next action (time while away is not counted).
4. Human-vs-algorithm compares one human run with one solver recording; the solver recording is held in memory only and is re-run after a page reload (~0.2 s).
5. The Explorer records the *first* solution only (it is 23,291 events). It cannot replay the 65-second exhaustive search; the API caps searches at 30 s.
6. The gallery's solution list for the original puzzle is precomputed (shipped as data). Custom puzzles show only solutions a user has asked the solver to save.
7. Mouse drag-and-drop exists for tray → board only; moving a placed piece is click/keyboard based (by design: drag must never be required).
8. The Creator accepts at most 30 pieces and boards up to 100×100; it rejects puzzles that are provably unsolvable instead of storing them.

**Engineering**
9. Single-process design: run **one** uvicorn worker (concurrency cap and cancellation are in-process).
10. No dead-space pruning in the solver; hard custom puzzles with many pieces will hit `node_limit`/`time_limit` (reported as inconclusive).
11. No per-client rate limiting, authentication or data expiry; unauthenticated writes (custom puzzles ≤ 200, attempts). Needs the reverse proxy for hostile environments.
12. 7 moderate `npm audit` advisories in **dev-only** tooling (`minimatch` via the lint chain); 0 in production dependencies. Fix needs breaking major upgrades; left for a maintenance pass. `pip-audit` was not run.
13. E2E runs on Chromium only, on macOS. CI workflow is written but has never run (no remote runs were performed). Windows is untested (the Playwright web-server command uses `rm`/env-prefix shell syntax).
14. Not tested with real assistive technology or real touch devices (axe passes; touch uses the same pointer/click path).
15. No container image or hosting configuration.
16. Backend: `attempts` rows are not capped per client; the 200-custom-puzzle cap is not atomic under concurrent creates (can briefly exceed); deleting a custom puzzle also deletes every client's attempts for it (intended); there is no explicit request-body size limit (proxy should set one).
17. Frontend minor: an unknown `?challenge=` id silently falls back to free play; a failed `localStorage` write (storage full) is not surfaced; a late response in the Creator's "Edit copy" could load an older puzzle; the Explorer playback loop calls `setPlaying` inside a state updater (idempotent, not pure); on a truncated or solution-less recording the Compare table's "Board changes" covers only the recorded part (a notice says so); the two Compare charts use separate x-axes (labelled); the loading fallback renders without the header; nav links are 40 px tall (WCAG 2.2 passes, 44 px guideline not met); on phones the sticky header (~130 px) can cover a board scrolled to the very top.
18. TypeScript 6 / Vite 8 / Vitest 5 / ESLint 10 were the latest at install time; versions are pinned by `package-lock.json`.

## Remaining blockers before release
1. Human UAT (checklist).
2. Pick a project licence (deliberately deferred) and resolve the unlicensed-upstream question for the shared puzzle definition (see [licensing.md](licensing.md)).
3. Decide hosting, rate limiting and backup (see [deployment.md](deployment.md)).
4. Run CI once on the real remote; run `pip-audit`.
