# Product overview

Edison Puzzle is an interactive rectangle-packing puzzle. Twelve rectangles must tile a 56 × 56 board exactly (areas sum to 3,136). The product lets a person solve it, watch a real solver do it, compare the two, and build their own puzzles.

## Implemented areas

| Area | Route | What it does |
|---|---|---|
| Landing | `/` | Explains the objective, shows the 12 pieces dimensioned, how to play, links to everything. |
| Puzzle Playground | `/play/:puzzleId?` | Select, place, move, rotate, remove pieces with mouse, touch or keyboard (drag is an extra, never required). Live preview with a reason when a placement is invalid. Undo/redo, reset, progress, timer, in-progress persistence. Completion shows results and has the server re-verify the arrangement. |
| Algorithm Explorer | `/explore/:puzzleId?` | Streams the **real** solver's events over SSE and plays them: play/pause, step forward/back, scrub, jump to next board change / dead end / solution, 6 speeds, live counters, plain-language narration. |
| Human vs Algorithm | `/compare/:puzzleId?` | Your best (or chosen) run beside the solver's, a coverage chart for each, a metrics table that defines each measure, a fairness note, and a check of whether both boards are the same solution family. |
| Solutions Gallery | `/solutions/:puzzleId?` | All stored arrangements grouped into families under board rotations/reflections, with the relationship of each to its family's base. |
| Challenges | `/challenges` | 7 challenges (easy to expert) built on actual rules: undo, board actions, time, no rotation. Server-evaluated; progress tracked. |
| Puzzle Creator | `/create` | Edit board and pieces; live server analysis explains invalid or provably unsolvable setups; save, load as copy, delete; ask the solver; play it. |
| Results | `/results/:puzzleId?` and inline | Completed board, time, actions vs minimum, undos, rotations, challenge checks, history of runs; re-verified by the server. |
| Preferences | `/settings` | Board display options, reduced motion, clear local data, and what is stored where. |

## What the puzzle actually is (verified facts)

* Exhaustive search of the original puzzle (rotation allowed, identical pieces interchangeable) found **exactly 8 arrangements**, all rotations/reflections of **one** arrangement: 5,485,433 search nodes, ~65 s. This is asserted by a slow test and stored in `src/edison_puzzle/data/original_solutions.json`.
* The original puzzle **cannot** be solved with rotation disabled (tested), so no "no-rotation" challenge exists for it; that challenge uses a purpose-built 24 × 24 puzzle whose tiling needs no rotation.
* The solver finds the first solution in 1,102 nodes (~15 ms of compute); its trace is 23,291 events.

## Visual design

Technical-drawing aesthetic: light paper with a fine construction grid, cobalt linework, restrained amber fills, rulers with coordinates, dimension lines, IBM Plex Sans/Mono (self-hosted via `@fontsource`, no external font requests). The design direction above is the source of truth; there is no separate design document. Design tokens are in `frontend/src/styles/tokens.css`.
