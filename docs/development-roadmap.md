# Roadmap

The phase-1 roadmap ([archive](archive/phase1-development-roadmap.md)) is complete. This lists only what is **not** implemented.

## Before release
UAT, licence decision, hosting/rate-limit/backup decisions, first CI run (see [engineering-handoff.md](engineering-handoff.md)).

## Ideas (not implemented, not promised)
* Dead-space pruning and symmetry breaking in the solver (smaller search, 1-not-8 solutions).
* Explorer: record/replay more than the first solution; export a run; side-by-side two-puzzle comparison.
* Accounts or an optional sync code for cross-device progress; server-side verification of times (would need replay of actions).
* Share a custom puzzle by link; puzzle import/export.
* Streaming search for custom puzzles with a progress bar instead of a one-shot solve.
* Multiple workers with a shared concurrency limiter; per-client rate limits in the app.
* Container image, deployment pipeline, error monitoring.
* Localisation; more challenge types (e.g. "place the five largest pieces correctly").
