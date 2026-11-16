# Licensing and security review

## Decisions recorded (owner, 2026-11-16)
1. **No project licence for now.** None has been added. Until one is, all rights are reserved.
2. **The original puzzle definition stays**, for this non-commercial portfolio project. The 56 × 56 board and the twelve piece dimensions are kept, with the attribution below. **This project does not claim ownership of the puzzle definition.** The uncertainty is **unresolved**: no permission has been obtained from the upstream author, and no upstream source code or solver output is published. Revisit before any commercial use or any release beyond a portfolio showcase.

Data that is *derived* but not copied: `src/edison_puzzle/data/original_solutions.json` holds the eight tilings found by this project's own exhaustive search (`scripts/generate_original_solutions.py`) from the puzzle definition above. It is not upstream output.

## Upstream code
The original puzzle idea and a first solver come from <https://github.com/lnmangione/Edison-Puzzle> (commit `24bef16`, files `solver.py` and `visualizer.py`).

* **The upstream repository has no licence** (GitHub reports `license: null`; no LICENSE file). Without a licence, all rights are reserved, so its code may not be copied or redistributed.
* **Action taken:** no upstream source is in the distributable tree. A local reference copy made during analysis lives in `legacy/`, which is **git-ignored** and must not be committed or published; delete it if in doubt. The engine here is an independent implementation of the same published idea (backtracking from the first free cell), written from scratch with different structure, data model and tests.
* Facts derived from the upstream puzzle (the 12 piece dimensions and 56 × 56 board, as listed in the upstream repository) are puzzle data, not expression. The upstream solver's *output coordinates* were previously kept as a validator regression fixture; that fixture has been **removed**, and the three tests that used it now validate a tiling produced by this project's own solver. No upstream output is stored in the repository.
* **Remaining dependency, for the owner to decide:** the twelve piece dimensions in `src/edison_puzzle/catalog.py` (and the independent copy in `tests/test_original_puzzle.py`) are the same numbers as the upstream `all_pieces` list. They define the puzzle and are facts rather than creative expression, but they are not independently sourced. If you want certainty, ask the upstream author for a licence or permission, or replace the original puzzle with one whose dimensions you can source elsewhere.
* Attribution: documents credit the upstream repository as the origin of the puzzle. Consider asking the author for permission or a licence if you plan to market the product as derived from their work.

## This project
No licence file has been added: that is the owner's decision. Until one is chosen, others have no right to use the code.

## Third-party dependencies
Runtime: FastAPI, uvicorn, Pydantic, Starlette (MIT/BSD); React, react-dom, react-router-dom (MIT); IBM Plex Sans/Mono via `@fontsource` (SIL Open Font License 1.1: free to redistribute with the app; keep the font licence files that ship inside the packages). Dev: pytest, ruff, mypy, Vite, Vitest, Testing Library, ESLint, Prettier, Playwright, axe-core (MIT/Apache/MPL: dev-only, not shipped). `npm ls` / `pip list` give exact versions; no licence scan tool was run, so verify before distribution.

## Security review (what was checked)
| Area | Result |
|---|---|
| Secrets, credentials, keys | None in the repo (pattern scan of every would-be-committed file; the only "token" hits are a docstring and `secrets.token_hex` for ids). No `.env` is used or required. |
| Local paths / personal data | Scrubbed from docs. The browser stores only a random id; the server never receives names or emails. |
| What git would add | Checked with a dry run: no `.venv`, caches, databases, `node_modules`, `dist`, test output, or `legacy/`. Pre-release audit repeated: no secrets, personal data or absolute local paths in any file to be committed. |
| Input validation | Pydantic with `extra=forbid` and numeric bounds on every request; custom puzzle input analysed from raw JSON; placements bounded so validation cost is bounded. |
| SQL | Parameterised queries only. |
| Path traversal | SPA static handler restricts to the dist folder and a path whitelist; tested with `..` and encoded variants. |
| Resource exhaustion | Hard caps on nodes/time/events, concurrency cap with 429, 200 custom puzzles max, SSE cancellation on disconnect. **No per-client rate limiting** (needs the proxy). |
| AuthN/Z | None: there are no accounts. Anyone can create/delete **custom** puzzles (built-ins are protected) and submit attempts. Fine for a single-user or trusted deployment; not for an open internet service without rate limits and cleanup. |
| Client-reported stats | Time/actions/undos are not verifiable; the UI says so. |
| XSS | React escapes output; no `dangerouslySetInnerHTML`. User-entered puzzle names render as text. |
| Headers / CSP / HTTPS | Not set by the app; configure at the proxy. |
| Dependency audit | Not run. Run `npm audit` and `pip-audit` before release. |
