> **Licensing note.** The upstream repository has no licence, so none of its source or output is redistributed in this repository. The analysis below was made from a private local copy that is not published. See [licensing.md](licensing.md). The analysis stands.

# Technical assessment of the original implementation

Source: <https://github.com/lnmangione/Edison-Puzzle>, commit `24bef16` ("Added visualizer"). It was inspected from a private local copy, which is not part of this repository.

The repo is two files: `solver.py` (100 lines) and `visualizer.py` (28 lines, pygame). No tests, README or dependency list.

## How it works

| Aspect | Original behaviour |
|---|---|
| Board | `Board.SIZE = 56`. `grid[y][x]` is a `bool` list-of-lists, `True` = free. Also tracks `next_free = (x, y)` and `space` (free cell count). Square only. |
| Pieces | 12 `(width, height)` tuples in `all_pieces`. No ids. |
| Total area | 3136 = 56². The puzzle is an *exact tiling*: all pieces must be used and the board fully covered. |
| Placement validation | `does_fit(piece)` checks bounds, then every cell of the footprint is free. It only ever tests the piece at `next_free`. |
| Rotation | For each remaining piece, tries `(w, h)` then `(h, w)`. |
| Next free cell | `insert()` rescans the whole grid row-major after every insert. |
| Search | Recursive DFS: at the first free cell, try every remaining piece in both orientations; on failure undo and continue. Stops when `space == 0`. |
| Solution representation | A list of `((w_as_placed, h_as_placed), (x, y))`. No piece id, no rotated flag. |
| Visualization | pygame; `visualize(positions)` redraws all placed pieces as green outlines at **every** search node, then `sleep(0.01)`. |

**The core idea is sound and complete.** In any tiling the first free cell (row-major) must be the top-left corner of some piece, so anchoring every placement there skips no tiling and tries no placement order twice. The new solver keeps this idea.

## Verification of the original

I ran the unmodified `solver.py` with pygame stubbed out and sleeps disabled.

* It finds a solution after **1,212 search nodes in ~0.4 s**.
* Its output (12 placements) was checked with the independent validator in `src/edison_puzzle/validation.py` and is **a valid tiling**. That output is deliberately not stored in this repository; the validator's regression tests use a tiling found by this project's own solver instead.
* So I found **no correctness bug** that affects the original puzzle.

## Issues found

### Bugs / robustness

1. **Runs on import.** The solve, the pygame window and `time.sleep(25)` execute at module level with no `if __name__ == "__main__"` guard, so the code cannot be imported or unit-tested.
2. **Name shadowing.** `visualizer = visualizer.Visualizer()` rebinds the imported module name to an instance. It works only by accident and breaks on re-import.
3. **Implicit `None` result.** `get_solution` falls off the end when no solution exists, so "no solution" and "error" are indistinguishable from a print of `None`.
4. **No input validation.** Nothing checks that piece area equals board area. With a mismatched set the search can never succeed and runs to full exhaustion. Termination (`space == 0`) implies all pieces were used *only* because areas happen to balance.
5. **Window never pumps events.** No `pygame.event.pump()`/quit handling, so the OS typically marks the window unresponsive; the closing `sleep(25)` is a hack to keep it open.
6. **Hard-coded 56 in two places** (`Board.SIZE`, `Visualizer.__init__`). Other board sizes need edits in both.

### Algorithmic limitations and performance

1. **Identical pieces are branched separately.** `(21,18)` and `(21,14)` each appear twice, so the search explores both orderings of interchangeable pieces. Redundant work multiplies with depth, and "find all solutions" would return duplicates that differ only by piece swaps.
2. **Squares are tried in both orientations** (no squares in the original set, but wasteful in general).
3. **Per-node deep copies.** Every successful placement `deepcopy`s the 56×56 grid and the remaining-piece list.
4. **Full-grid rescan on every insert.** `insert()` keeps looping after finding the next free cell (the `updated` flag skips assignment but not iteration), so each insert costs 3136 iterations.
5. **Rendering is on the search hot path.** One redraw plus a 10 ms sleep per node means ≥ ~12 s of pure sleeping for the 1,212 nodes, before drawing cost. Search and rendering cannot be separated or replayed.
6. **No pruning.** Dead space (for example a free gap narrower than every remaining piece) is only discovered by brute-force failing later.
7. **Single solution only.** The first hit returns; the design cannot enumerate more.
8. **Shared mutable `positions`.** The returned list is the same live object the recursion keeps mutating.

### Missing validation

* No bounds or overlap check on a *final* solution, only on incremental placement.
* No check for non-positive dimensions, duplicate pieces, or piece larger than board (the latter is only rejected implicitly at placement time).
* No way to validate an externally supplied arrangement.

## What the rewrite measured

| | Original (rendering stubbed) | New solver |
|---|---|---|
| Nodes to first solution | 1,212 | 1,102 |
| Wall time to first solution | ~0.4 s | ~15 ms |
| Events with `trace=True` (first solution) | n/a | 23,291 |
| Exhaustive search | not possible | 5,485,433 nodes, ~65 s, **8 solutions** |

Timings are from one machine (Python 3.14 on macOS) and indicative only. The node reduction (~9%) comes from collapsing identical pieces. The time reduction comes from undo-in-place and bitmask rows instead of deep copies and full rescans.

### Finding about the puzzle itself

Exhaustive search (rotation allowed) finds **exactly 8 tilings**. They are one solution and its 8 board symmetries (rotations and reflections): the puzzle has **one essentially unique solution**. This is asserted by the slow test `test_exhaustive_search_finds_one_solution_up_to_board_symmetry`. Two caveats: it counts tilings with interchangeable pieces treated as identical, and it relies on this solver's completeness, which was cross-checked against an independent brute-force oracle only on small boards, not on the 56×56 case.

## Potential improvements (not yet implemented)

* Dead-space pruning to shrink the exhaustive search.
* Symmetry breaking (fix one symmetric image) to report 1 instead of 8 solutions.
* Move the search to a worker with cancellation for server use (currently limits: `max_nodes`, `time_limit_s`).
* Streaming events instead of buffering (the solver is already a lazy generator).
