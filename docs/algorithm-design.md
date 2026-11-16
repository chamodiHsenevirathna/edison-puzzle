# Algorithm design

Implementation: [`src/edison_puzzle/`](../src/edison_puzzle/). Standard library only.

## Modules

| Module | Responsibility |
|---|---|
| `models.py` | Immutable data: `Rectangle`, `Placement`, `PuzzleConfig`, `Solution`. Constructor validation (positive ints, unique ids). `to_dict`/`from_dict` use the camelCase wire format. |
| `board.py` | `Board`: mutable occupancy state with `check`, `place`, `remove`, `first_free`, `copy`, `snapshot`/`restore`, `to_grid`. |
| `validation.py` | `validate_solution`: complete-tiling check. Independent of `Board` and the solver by design. |
| `events.py` | Event dataclasses, `SolverMetrics`, status constants. |
| `solver.py` | `Solver.run()` (lazy event generator), `solve()` (run to completion), `SolverOptions`. |
| `catalog.py` | `original_puzzle()`: 56×56, the 12 original rectangles. |

## Domain model

* Coordinates: `(0,0)` top-left, x right, y down. Integer cells.
* A **puzzle** is a board plus a list of uniquely-id'd rectangles. It is solved when every piece is placed exactly once, nothing overlaps or leaves the board, and the board is fully covered.
* **Rotation**: a non-square piece may be placed as `(w,h)` or `(h,w)` when `allowRotation` is true. A `Placement` stores dimensions *as placed* plus a `rotated` flag, so consumers never re-derive them. Squares are never `rotated`.
* A puzzle whose piece area differs from the board area is representable (it is valid config) but unsolvable; `solve` reports `not_solvable` without searching. Solvability is otherwise never assumed; it is established by running the solver.

## Board state

Occupancy is one integer bitmask per row. `check(x, y, w, h)` returns `None` or a reason (`out_of_bounds`, `overlap`, `invalid_size`) in O(h). The ordered `placements` dict is the source of truth; grids are derived (`to_grid`).

| Need | Mechanism |
|---|---|
| Undo | `remove(piece_id)` clears exactly that piece's cells. |
| Copy | `copy()` is independent in both directions (tested). |
| Restore | `snapshot()` returns an immutable tuple of placements; `restore(snapshot)` rebuilds into a staging board and swaps only if every placement is valid, so a bad snapshot leaves the board untouched. |

## Search

Depth-first, anchored at the first free cell in row-major order:

1. `first_free()`; if `None`, the board is full and (since areas balance and nothing overlaps) every piece is placed, so emit a solution.
2. For each group of interchangeable pieces that still has an unplaced member, take its first unplaced piece (config order).
3. Try each orientation: `check`, then `place`, recurse, `remove`.

**Why it is complete.** The first free cell in a tiling must be the top-left corner of the piece covering it, so no tiling is skipped. **Why no duplicates.** Each tiling fixes that corner choice at every level, so each tiling is generated once (given the grouping below).

**Interchangeable pieces.** Pieces of identical dimensions are one branch, using the first unplaced id. Two pieces are interchangeable if their dimensions match *up to rotation when rotation is allowed*, and *exactly* when it is not. (A 2×3 and a 3×2 are different pieces if rotation is off.) Solutions are therefore counted up to swapping identical pieces; ids are assigned in config order.

> The first version of the solver grouped by orientation-independent shape even with rotation disabled, and silently lost 5 of 12 tilings on a 5×5 case. The brute-force oracle test caught it; the fix and a regression case are in `tests/test_solver.py`.

**Determinism.** Group order = first appearance in config; orientation order = as-defined then rotated. Same input gives the same event stream (tested).

**Multiple solutions.** `SolverOptions.max_solutions` (`None` = all). The search simply continues after a solution instead of returning. Cost on the original puzzle: all 8 solutions in ~65 s / 5.5 M nodes.

**Limits.** `max_nodes`, `time_limit_s` (checked every 1024 nodes). Hitting one yields `node_limit`/`time_limit`; solutions found so far are still returned.

## Execution events

`Solver.run()` is a generator. Nothing is rendered or buffered by the solver; the consumer decides (collect, stream, throttle). Single use per `Solver`.

| Event | Emitted when | Candidate in `placements`? |
|---|---|---|
| `solver_started` | once, first | n/a (carries the puzzle) |
| `piece_selected` | a piece is chosen to try at the first free cell `(x,y)` | n/a |
| `placement_attempted` | one orientation of that piece is about to be checked | no |
| `placement_accepted` | check passed; piece placed | yes |
| `placement_rejected` | check failed; `reason` = `out_of_bounds` or `overlap` | no |
| `backtrack_started` | the subtree under a placement is exhausted | yes |
| `backtrack_completed` | that placement has been removed | no (`removed` field) |
| `solution_found` | board full; carries the `Solution` and `solutionIndex` | n/a |
| `search_completed` | once, last; `status`, `solutionsFound`, final `SolverMetrics` | n/a |

Invariants (each verified by a test): `seq` is 0-based and gap-free; every attempt is followed by exactly one accept or reject; every accept in an exhausted search is undone by a matching backtrack pair, in LIFO order; each event's `placements`/`remaining` equals an independent replay of the stream; `depth` matches the placed count; final metrics equal event counts.

**Trace levels.** `trace=False` (default) emits only `solver_started`, `solution_found`, `search_completed`, so large searches stay cheap. `trace=True` adds the step events (23,291 for the original puzzle's first solution). Metrics are identical either way.

**Search status**: `exhausted`, `max_solutions`, `node_limit`, `time_limit`, `cancelled`, `not_solvable`. (The API adds `event_limit` when a recorded trace is truncated.)

## Validation

`validate_solution(puzzle, placements)` reports *all* problems, each with a stable `code` and optional `pieceId`: `unknown_piece`, `duplicate_piece`, `missing_piece`, `dimension_mismatch`, `rotation_not_allowed`, `rotation_flag_mismatch`, `out_of_bounds`, `overlap`, `uncovered_cells`. It counts cell coverage directly rather than reusing `Board`, so it can independently check solver output (see `tests/test_validation.py`).

## Known limitations

* No dead-space pruning; exhaustive search of the original puzzle takes ~65 s.
* "All solutions" includes board symmetries (8 images of the one original solution).
* Recursion depth equals piece count, so very large piece lists hit Python's recursion limit (~1000) first; not a concern for this puzzle (12).
* Solver is CPU-bound and synchronous; it stops by limits or by `cancel()` (see below), checked at each node.

---

## Additions in the product phase

### Cancellation and live metrics
`Solver.cancel()` (thread-safe) makes the search stop at the next node with status `cancelled`; `Solver.metrics()` reads counters while running. The API uses this to stop a search when an SSE client disconnects.

### Compact events and replay
`event.to_dict(compact=True)` omits the `placements`/`remaining` snapshots. `replay_placements(events)` rebuilds the board after each event from `placement_accepted` (push) and `backtrack_completed` (pop) alone; the frontend implements the same rule. Tests assert, for every event of real traces, that the replayed board equals the engine's own snapshot (Python side and TypeScript side).

### Symmetry and solution families (`symmetry.py`)
A square board has 8 symmetries (rotations and reflections), a non-square board 4. Two solutions are in one **family** if one is a symmetry image of the other (compared as geometry; identical pieces interchangeable). `classify()` returns families, with each member's transform relative to the family's base (lowest index) and the number of *distinct* images the arrangement has (less than the symmetry count if the arrangement is itself symmetric). Verified against an independent brute-force oracle and by applying all 8 transforms to the original solution and re-validating each.

**Result for the original puzzle:** 8 arrangements, 1 family, 8 distinct images (the arrangement has no symmetry of its own).

### Puzzle analysis (`analysis.py`)
Necessary conditions checked without searching: total area equals board area; every piece fits the empty board in an allowed orientation; size limits (board side ≤ 100, ≤ 30 pieces). Failing a condition proves the puzzle unsolvable ("impossible"); passing proves nothing ("unknown"), so the solver is the only judge of real solvability. A solver run that ends `exhausted` with no solution is a proof; `node_limit`/`time_limit` are inconclusive and the UI says so.

### Challenges (`challenges.py`)
Constraints are limited to what the puzzle's rules make meaningful and measurable: board actions (place, move, rotate in place, remove; undo/redo and tray rotation are not actions), undos, time. Tests check each challenge is achievable (perfect run passes; constraint ≥ number of pieces; the puzzle has a tiling).

### Facts established by exhaustive search (tests)
* Original puzzle: exactly 8 solutions = 1 family (slow test).
* Original puzzle with rotation disabled: **no** solution (so no no-rotation challenge uses it).
* Warm-ups: `warmup-8` 16 tilings, `warmup-16` 288, `warmup-24-fixed` 128 (rotation off), all computed at start-up in milliseconds.

### Known algorithmic limitations (unchanged)
No dead-space pruning, so exhaustive search of the original takes ~65 s (offline, precomputed; the API's bounded search cannot reproduce it within its 30 s cap). Custom puzzles with many pieces can exceed limits; the API then returns `node_limit`/`time_limit`.
