# Data model

## Domain (engine)
* `Rectangle {id, width, height}`; `PuzzleConfig {id, name, board_width, board_height, pieces, allow_rotation}`.
* `Placement {piece_id, x, y, width, height, rotated}`: dimensions **as placed**; squares are never `rotated`.
* `Solution {puzzle_id, placements}` (placements in the order the solver placed them).
* Identical pieces (same dimensions, up to rotation when rotation is allowed) are interchangeable; solutions are compared as sets of `(x, y, w, h)`.

## SQLite tables (server)
| Table | Columns | Notes |
|---|---|---|
| `puzzles` | `id` PK, `name`, `config_json`, `built_in`, `exhaustive`, `created_at` | built-ins are upserted at every start-up (so code is authoritative); `created_at` of built-ins is their display order; custom ids look like `c-1a2b3c4d` |
| `solutions` | `id`, `puzzle_id` FK, `geometry_key`, `placements_json`, `created_at`; UNIQUE(`puzzle_id`,`geometry_key`) | de-duplicated by geometry; `puzzles.exhaustive=1` once a full search stored them |
| `attempts` | `id`, `client_id`, `puzzle_id` FK, `challenge_id`, `passed`, `time_ms`, `actions`, `undos`, `placements_json`, `created_at` | only server-validated completions; index on (`client_id`,`puzzle_id`) |

Foreign keys cascade: deleting a custom puzzle removes its solutions and attempts. WAL mode; one short-lived connection per operation.

## Browser (`localStorage`, prefix `edison:`)
| Key | Content |
|---|---|
| `clientId` | random anonymous id used to tag attempts (never a name or account) |
| `prefs` | display options, reduced-motion choice, explorer speed |
| `game:<puzzleId>` | game in progress: placements, stats, elapsed time, timeline (not undo history). Not used in challenge mode |
| `runs:<puzzleId>` | last 20 completed runs (placements + timeline) |
| `lastRun` | pointer to the most recent run |
| `challengeProgress` | cache of challenge results (server value wins when reachable) |

Every read is wrapped so corrupt, missing or blocked storage behaves as empty. Solver recordings (Explorer/Compare) are cached **in memory only**.

## What needs the backend vs. stays local
| Needs the backend | Local only |
|---|---|
| puzzle definitions, custom puzzles, saved solutions, solving, the event stream, validation, challenge evaluation, stored completions | preferences, game in progress, run history, UI state |

If the backend is unreachable you can still play an already-loaded puzzle and your finished run is kept locally with a "retry verification" option; loading puzzles/challenges/solutions needs the server.
