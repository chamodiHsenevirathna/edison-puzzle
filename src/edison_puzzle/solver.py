"""Backtracking solver that streams execution events.

Algorithm (the same published idea as the original Edison-Puzzle solver)
------------------------------------------------------------------------
Depth-first search. At each node take the first free cell in row-major order.
In any complete tiling that cell must be the top-left corner of some piece, so
only placements anchored exactly there need to be considered -- this makes the
search complete (no tiling is skipped) while never trying the same set of
placements in two different orders.

Differences from the original approach
--------------------------------------
* Interchangeable pieces (same dimensions, up to rotation when rotation is
  allowed) form one branch instead of N, which
  removes redundant sub-searches and makes "all solutions" meaningful (a
  solution differs only by geometry, not by which identical piece sits where).
  The piece id used for a group is always the first unplaced one in config order.
* Squares and rotation-disabled puzzles do not try a second orientation.
* One mutable `Board` with place/remove (undo) instead of deep-copying the grid.
* Search is a generator of `SolverEvent`s; rendering is entirely the consumer's
  concern. Resource limits (`max_nodes`, `time_limit_s`) are explicit.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from dataclasses import dataclass, field

from .board import Board
from .events import (
    STATUS_CANCELLED,
    STATUS_EXHAUSTED,
    STATUS_MAX_SOLUTIONS,
    STATUS_NODE_LIMIT,
    STATUS_NOT_SOLVABLE,
    STATUS_TIME_LIMIT,
    BacktrackCompleted,
    BacktrackStarted,
    PieceSelected,
    PlacementAccepted,
    PlacementAttempted,
    PlacementRejected,
    SearchCompleted,
    SolutionFound,
    SolverEvent,
    SolverMetrics,
    SolverStarted,
)
from .models import Placement, PuzzleConfig, Solution


@dataclass(frozen=True)
class SolverOptions:
    max_solutions: int | None = 1  # None = find all
    trace: bool = False  # emit per-step events (piece/placement/backtrack)
    max_nodes: int | None = None  # abort after this many search nodes
    time_limit_s: float | None = None

    def __post_init__(self) -> None:
        if self.max_solutions is not None and self.max_solutions < 1:
            raise ValueError("max_solutions must be >= 1 or None")
        if self.max_nodes is not None and self.max_nodes < 1:
            raise ValueError("max_nodes must be >= 1 or None")
        if self.time_limit_s is not None and self.time_limit_s <= 0:
            raise ValueError("time_limit_s must be > 0 or None")


@dataclass
class SolveResult:
    status: str
    solutions: list[Solution]
    metrics: SolverMetrics
    events: list[SolverEvent] = field(default_factory=list)


class Solver:
    def __init__(self, puzzle: PuzzleConfig, options: SolverOptions = SolverOptions()) -> None:
        self.puzzle = puzzle
        self.options = options
        self._cancelled = False
        self._m = dict(nodes=0, attempted=0, accepted=0, rejected=0, backtracks=0, solutions=0, max_depth=0)
        self._start = time.perf_counter()

    # ------------------------------------------------------------------ public
    def cancel(self) -> None:
        """Ask a running search to stop. Safe to call from another thread; the
        search notices at the next node and finishes with status `cancelled`."""
        self._cancelled = True

    def metrics(self) -> SolverMetrics:
        """Counters so far (valid while running and after completion)."""
        return self._metrics()

    def run(self) -> Iterator[SolverEvent]:
        """Run the search lazily, yielding events. Single use per Solver instance."""
        puzzle, opts = self.puzzle, self.options
        self._seq = 0
        self._m = dict(nodes=0, attempted=0, accepted=0, rejected=0, backtracks=0, solutions=0, max_depth=0)
        self._start = time.perf_counter()
        self._stop_status: str | None = None
        self._board = Board(puzzle.board_width, puzzle.board_height)
        self._placed: list[str] = []

        # Group interchangeable pieces. Each group's list is reversed so that
        # pop() yields the first piece in config order and undo is append().
        # A 2x3 and a 3x2 piece are interchangeable only when rotation is
        # allowed; otherwise they are different pieces and must not be merged.
        groups: dict[tuple[int, int], list[str]] = {}
        for p in puzzle.pieces:
            key = p.shape_key if puzzle.allow_rotation else (p.width, p.height)
            groups.setdefault(key, []).append(p.id)
        self._group_keys = list(groups)
        self._free = {k: list(reversed(v)) for k, v in groups.items()}
        self._dims = {p.id: (p.width, p.height) for p in puzzle.pieces}

        yield self._ev(SolverStarted, puzzle=puzzle, max_solutions=opts.max_solutions, trace=opts.trace)

        if not puzzle.is_area_balanced:
            msg = (
                f"pieces cover {puzzle.pieces_area} cells but the board has {puzzle.board_area}; "
                "no exact tiling can exist"
            )
            yield self._ev(
                SearchCompleted, status=STATUS_NOT_SOLVABLE, solutions_found=0, metrics=self._metrics(), message=msg
            )
            return

        yield from self._dfs(0)

        status = self._stop_status or STATUS_EXHAUSTED
        yield self._ev(SearchCompleted, status=status, solutions_found=self._m["solutions"], metrics=self._metrics())

    # ------------------------------------------------------------------ helpers
    def _ev(self, cls, **kw):  # type: ignore[no-untyped-def]
        ev = cls(seq=self._seq, **kw)
        self._seq += 1
        return ev

    def _metrics(self) -> SolverMetrics:
        m = self._m
        return SolverMetrics(
            nodes_visited=m["nodes"],
            placements_attempted=m["attempted"],
            placements_accepted=m["accepted"],
            placements_rejected=m["rejected"],
            backtracks=m["backtracks"],
            solutions_found=m["solutions"],
            max_depth=m["max_depth"],
            elapsed_ms=round((time.perf_counter() - self._start) * 1000, 3),
        )

    def _remaining(self) -> tuple[str, ...]:
        placed = set(self._placed)
        return tuple(p.id for p in self.puzzle.pieces if p.id not in placed)

    def _limit_hit(self) -> str | None:
        if self._cancelled:
            return STATUS_CANCELLED
        o = self.options
        if o.max_nodes is not None and self._m["nodes"] >= o.max_nodes:
            return STATUS_NODE_LIMIT
        if o.time_limit_s is not None and (self._m["nodes"] & 1023) == 0:
            if time.perf_counter() - self._start > o.time_limit_s:
                return STATUS_TIME_LIMIT
        return None

    # ------------------------------------------------------------------- search
    def _dfs(self, depth: int) -> Iterator[SolverEvent]:
        m, board, trace = self._m, self._board, self.options.trace
        limit = self._limit_hit()
        if limit:
            self._stop_status = limit
            return
        m["nodes"] += 1
        if depth > m["max_depth"]:
            m["max_depth"] = depth

        cell = board.first_free()
        if cell is None:
            if len(self._placed) == len(self.puzzle.pieces):
                m["solutions"] += 1
                sol = Solution(self.puzzle.id, board.placements)
                yield self._ev(SolutionFound, solution_index=m["solutions"] - 1, solution=sol)
                mx = self.options.max_solutions
                if mx is not None and m["solutions"] >= mx:
                    self._stop_status = STATUS_MAX_SOLUTIONS
            return
        x, y = cell

        for key in self._group_keys:
            group = self._free[key]
            if not group:
                continue
            piece_id = group.pop()
            w, h = self._dims[piece_id]
            try:
                if trace:
                    yield self._ev(
                        PieceSelected,
                        depth=depth,
                        piece_id=piece_id,
                        x=x,
                        y=y,
                        placements=board.placements,
                        remaining=self._remaining(),
                    )
                orientations = [(w, h, False)]
                if self.puzzle.allow_rotation and w != h:
                    orientations.append((h, w, True))
                for pw, ph, rotated in orientations:
                    cand = Placement(piece_id, x, y, pw, ph, rotated)
                    m["attempted"] += 1
                    if trace:
                        yield self._ev(
                            PlacementAttempted,
                            depth=depth,
                            placement=cand,
                            placements=board.placements,
                            remaining=self._remaining(),
                        )
                    reason = board.check(x, y, pw, ph)
                    if reason is not None:
                        m["rejected"] += 1
                        if trace:
                            yield self._ev(
                                PlacementRejected,
                                depth=depth,
                                placement=cand,
                                reason=reason,
                                placements=board.placements,
                                remaining=self._remaining(),
                            )
                        continue

                    board.place(cand)
                    self._placed.append(piece_id)
                    m["accepted"] += 1
                    if trace:
                        yield self._ev(
                            PlacementAccepted,
                            depth=depth,
                            placement=cand,
                            placements=board.placements,
                            remaining=self._remaining(),
                        )

                    yield from self._dfs(depth + 1)
                    if self._stop_status:
                        return

                    m["backtracks"] += 1
                    if trace:
                        yield self._ev(
                            BacktrackStarted,
                            depth=depth,
                            placement=cand,
                            placements=board.placements,
                            remaining=self._remaining(),
                        )
                    board.remove(piece_id)
                    self._placed.pop()
                    if trace:
                        yield self._ev(
                            BacktrackCompleted,
                            depth=depth,
                            removed=cand,
                            placements=board.placements,
                            remaining=self._remaining(),
                        )
            finally:
                group.append(piece_id)


def solve(puzzle: PuzzleConfig, options: SolverOptions = SolverOptions(), collect_events: bool = False) -> SolveResult:
    """Run the solver to completion and return the outcome.

    With `collect_events=True` every event is retained (can be very large when
    `options.trace` is on); otherwise only solutions and the final status are kept.
    """
    solutions: list[Solution] = []
    events: list[SolverEvent] = []
    final: SearchCompleted | None = None
    for ev in Solver(puzzle, options).run():
        if collect_events:
            events.append(ev)
        if isinstance(ev, SolutionFound):
            solutions.append(ev.solution)
        elif isinstance(ev, SearchCompleted):
            final = ev
    assert final is not None
    return SolveResult(status=final.status, solutions=solutions, metrics=final.metrics, events=events)
