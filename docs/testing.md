# Testing

Passing a build is not treated as proof. Layers, from fast to slow:

| Layer | Tool | Count | What it proves |
|---|---|---|---|
| Engine and validation | pytest | 263 | board rules, placement/overlap/bounds, copy/restore, validator, solver completeness (against an independent brute-force oracle, known domino-tiling counts 3 and 36, 40 random solvable puzzles), events invariants (replay equals snapshots, metrics equal event counts), symmetry, analysis, challenges; bug-injection check done manually (8 mutations all caught) |
| API integration | pytest + FastAPI `TestClient` | 65 | every endpoint, error envelope, limits clamping, 429, SSE content and truncation, **disconnect cancels the search and frees the slot**, persistence across app restarts, cascade deletes, SPA fallback and path traversal |
| Contract | pytest | 7 | TypeScript interfaces' keys equal real engine/API output; status union equals engine statuses |
| Frontend logic | vitest | 95 | game reducer (placement, rotation, undo/redo, clock, completion, restore of corrupt data), geometry, storage, API client errors, SSE wrapper, replay vs real solver traces, narration |
| Frontend components | vitest + Testing Library (mocked API) | 59 | Board, tray, Playground journeys by keyboard through completion and offline verification, Creator validation and save/solve/delete, Challenges, Results |
| End-to-end | Playwright (Chromium) on the real server and production build | 62 | the 12 planned user journeys (14 tests), keyboard-only play, persistence across reload, 21 responsive-layout checks (7 pages x 3 widths), 11 axe/a11y/motion/skip-link checks, and 16 extras (`e2e/extras.spec.ts`: fresh-visitor empty states, unreachable-server and slow-server states on each data page, failed verification submit, preferences and clearing local data, blocked `localStorage`, custom-puzzle deletion, API error envelope, truncated stream, tap-to-place on a 390 px touch viewport) |
| Slow | pytest `-m slow` | 2 | exhaustive search finds exactly 8 solutions, one family |

Counts are as of the last full run (backend 335 + 2 slow, frontend 154, E2E 62).

## Running
`make test`, `make e2e`, `make test-slow` (see [development.md](development.md)). E2E needs Chromium (`npx playwright install chromium`). Screenshots of every page at desktop/tablet/mobile are written to `frontend/test-results/screens/` by `e2e/screens.spec.ts`.

## Test design notes
* The backend oracle (`tests/oracle.py`) uses a different anchor order and plain cell grids so it shares no logic with the solver; it caught a real bug during development (grouping 2×3 and 3×2 pieces when rotation is off).
* `e2e/journeys.spec.ts` runs in one shared browser session on purpose: they are one user story (a run completed in step 3 is compared in step 6). `extras.spec.ts` and the layout/a11y specs use fresh contexts.
* E2E places pieces by clicking real board coordinates computed from the SVG, using solutions fetched from the API as test data.

## Not covered
Browsers other than Chromium; real touch hardware (one emulated-touch tap test on a phone viewport; otherwise pointer clicks); screen-reader testing with real assistive technology; load testing beyond the concurrency cap; Windows/Linux (developed and tested on macOS).
