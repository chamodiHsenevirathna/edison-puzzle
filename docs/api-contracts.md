# API contracts (as implemented)

Base path `/api`. JSON, camelCase. Types: [`shared/types/api.ts`](../shared/types/api.ts) and [`edison.ts`](../shared/types/edison.ts). A test (`tests/test_contract_types.py`) fails if these types and the server's real responses disagree. Interactive docs: `/api/docs` (OpenAPI).

Coordinates: `(0,0)` top-left, x right, y down, in cells.

## Errors
Every failure: `{"error": {"code": string, "message": string, "details": [...]}}`.

| HTTP | `code` | When |
|---|---|---|
| 404 | `puzzle_not_found`, `challenge_not_found`, `not_found` | unknown id / route |
| 405 | `method_not_allowed` | wrong HTTP method for a route |
| 403 | `built_in_puzzle` | deleting a built-in puzzle |
| 409 | `limit_exceeded` | more than 200 custom puzzles |
| 422 | `invalid_request` | body/query fails validation (`details`: `{field,message}`) |
| 422 | `invalid_puzzle` | puzzle cannot be saved (`details`: analysis issues) |
| 422 | `challenge_mismatch`, `implausible_stats` | attempt inconsistent |
| 429 | `solver_busy` | 2 searches already running |

"No solution", "inconclusive" and "invalid arrangement" are **not** errors; they are 200 responses that say so.

## Endpoints

| Method & path | Purpose |
|---|---|
| `GET /api/health` | `{status, version}` |
| `GET /api/limits` | board/piece limits and solver caps |
| `GET /api/puzzles` | `{puzzles: PuzzleSummary[]}`; built-ins first (original, then warm-ups), then custom |
| `GET /api/puzzles/{id}` | `PuzzleDetail` = puzzle + `builtIn`, `piecesArea`, `boardArea`, `areaBalanced` |
| `POST /api/puzzles/analyze` | stateless analysis of a draft → `PuzzleAnalysis` |
| `POST /api/puzzles` | save a custom puzzle → 201 `PuzzleDetail`. Rejected (422) if analysis finds any error-level issue |
| `DELETE /api/puzzles/{id}` | delete a custom puzzle (and its solutions/attempts) → 204 |
| `POST /api/puzzles/{id}/solve` | bounded synchronous solve → `SolveResponse` |
| `GET /api/puzzles/{id}/solve/stream` | SSE stream of solver events |
| `POST /api/puzzles/{id}/validate` | `{placements}` → `{valid, errors[]}` |
| `GET /api/puzzles/{id}/solutions` | stored solutions, grouped into symmetry families |
| `GET /api/challenges` | challenge definitions |
| `POST /api/attempts` | submit a completed arrangement for validation/evaluation; stored if valid |
| `GET /api/attempts?clientId&puzzleId&limit` | a client's stored completions |
| `GET /api/progress?clientId` | best result per puzzle and per challenge |

### Puzzle input (analyze / create)
```json
{ "name": "My puzzle", "board": {"width": 12, "height": 8},
  "pieces": [{"width": 6, "height": 8}, {"width": 6, "height": 4}, {"width": 6, "height": 4}],
  "allowRotation": true }
```
Piece ids are optional (`r01`, `r02`, … assigned). **Change from the phase-1 proposal:** a puzzle whose piece area differs from the board area, or with a piece that cannot fit even rotated, is *rejected* at creation (it can never be won). The analysis explains why, with exact numbers.

`PuzzleAnalysis`: `{canSave, solvability: "impossible"|"unknown", boardArea, piecesArea, areaDifference, issues:[{severity:"error"|"warning"|"info", code, message, pieceId?}]}`. "impossible" means a necessary condition fails; "unknown" means only the solver can say.

### Solve
Request (all optional): `maxSolutions` (default 1, `null` = all), `events` (`none`|`milestones`|`full`), `maxNodes`, `timeLimitSeconds`, `maxEvents`, `save` (persist found solutions).
Response: `{puzzleId, status, solutions[], metrics, message, events?, eventsTruncated?, eventsCompact?}`.
`status`: `exhausted` (complete search), `max_solutions`, `node_limit`, `time_limit`, `cancelled`, `event_limit`, `not_solvable`. Only `exhausted` with no solutions proves a puzzle has none.
`events: "full"` returns **compact** events (no `placements`/`remaining` snapshots), truncated at `maxEvents`.

### Stream
`GET …/solve/stream?maxSolutions=1|all&maxNodes&timeLimitSeconds&maxEvents&trace=true&compact=true`

Frames: `: keepalive` comments, then
```
event: events
data: [ {"type":"solver_started","seq":0,...}, ... ]        (up to 500 events per frame)

event: done
data: {"status":"max_solutions","solutionsFound":1,"metrics":{...},"message":null,"eventsSent":23291,"truncated":false}
```
or `event: error` with `{code, message}` (e.g. `solver_busy`). Closing the connection cancels the search. When `truncated` is true the final `search_completed` event is not sent; `done.status` is `event_limit`.

Event types and semantics: [algorithm-design.md](algorithm-design.md#execution-events). Measured for the original puzzle: 23,291 events, ≈ 3.05 MB, ≈ 0.16 s to stream locally.

### Solutions
`{puzzleId, exhaustive, count, familyCount, boardSymmetries, solutions:[{index, familyId, canonical, transform, transformLabel, placements}], families:[{familyId, canonicalIndex, distinctImages, members:[{solutionIndex, transform, label}]}]}`.
`exhaustive: true` means the search ran to completion (original and the warm-ups). `transform` maps the family's base arrangement onto this one: `identity`, `flip_horizontal`, `flip_vertical`, `rotate_180`, and for square boards `transpose`, `rotate_90_cw`, `rotate_90_ccw`, `anti_transpose`.

### Attempts
Request: `{clientId (8–64 chars [A-Za-z0-9_-]), puzzleId, challengeId?, placements[], timeMs, actions, undos}`.
Response: `{valid, validation, minimumActions, attemptId|null, challenge: ChallengeResult|null}`. The arrangement is always validated server-side. **`timeMs`, `actions` and `undos` are reported by the client and are not verifiable** (there are no accounts or anti-cheat); the server only rejects the impossible (`actions` below the piece count). Invalid arrangements are reported but not stored.
