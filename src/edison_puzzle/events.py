"""Solver execution events.

Framework-independent, immutable, JSON-serialisable (`to_dict`). Each event is
a self-contained snapshot, so a consumer can render any single event without
replaying the ones before it.

State carried by events
-----------------------
`placements` : the pieces on the board *as of this event*.
`remaining`  : ids of pieces not on the board *as of this event*.
`depth`      : number of pieces on the board when the search node was entered
               (the root node has depth 0).

For `placement_attempted` / `placement_rejected` the candidate is NOT in
`placements`. For `placement_accepted` and `backtrack_started` it IS. For
`backtrack_completed` it is no longer.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import Any, ClassVar

from .models import Placement, PuzzleConfig, Solution

# SearchCompleted.status values
STATUS_EXHAUSTED = "exhausted"  # whole search space explored
STATUS_MAX_SOLUTIONS = "max_solutions"  # stopped: requested number of solutions found
STATUS_NODE_LIMIT = "node_limit"  # stopped: node budget used up
STATUS_TIME_LIMIT = "time_limit"  # stopped: wall-clock budget used up
STATUS_CANCELLED = "cancelled"  # stopped: cancel() was called (e.g. client disconnected)
STATUS_EVENT_LIMIT = "event_limit"  # stopped by the caller: event budget used up
STATUS_NOT_SOLVABLE = "not_solvable"  # rejected before searching (e.g. area mismatch)


SNAPSHOT_FIELDS = frozenset({"placements", "remaining"})


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(w.title() for w in rest)


def _dataclass_dict(obj: Any) -> dict[str, Any]:
    return {_camel(f.name): _jsonable(getattr(obj, f.name)) for f in dataclasses.fields(obj)}


def _jsonable(v: Any) -> Any:
    if hasattr(v, "to_dict"):
        return v.to_dict()
    if isinstance(v, (list, tuple)):
        return [_jsonable(i) for i in v]
    return v


@dataclass(frozen=True)
class SolverMetrics:
    nodes_visited: int = 0
    placements_attempted: int = 0
    placements_accepted: int = 0
    placements_rejected: int = 0
    backtracks: int = 0
    solutions_found: int = 0
    max_depth: int = 0
    elapsed_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return _dataclass_dict(self)


@dataclass(frozen=True)
class SolverEvent:
    type: ClassVar[str] = "event"
    seq: int  # 0-based, strictly increasing within one run

    def to_dict(self, compact: bool = False) -> dict[str, Any]:
        """JSON-ready dict. With `compact=True` the per-event state snapshots
        (`placements`, `remaining`) are omitted; a consumer can rebuild them by
        replaying the stream (see `replay_placements`). `depth` is kept."""
        d = {"type": self.type}
        for f in dataclasses.fields(self):
            if compact and f.name in SNAPSHOT_FIELDS:
                continue
            d[_camel(f.name)] = _jsonable(getattr(self, f.name))
        return d


@dataclass(frozen=True)
class SolverStarted(SolverEvent):
    type: ClassVar[str] = "solver_started"
    puzzle: PuzzleConfig
    max_solutions: int | None
    trace: bool


@dataclass(frozen=True)
class PieceSelected(SolverEvent):
    """The solver chose `piece_id` to try at the first free cell (x, y)."""

    type: ClassVar[str] = "piece_selected"
    depth: int
    piece_id: str
    x: int
    y: int
    placements: tuple[Placement, ...]
    remaining: tuple[str, ...]


@dataclass(frozen=True)
class PlacementAttempted(SolverEvent):
    type: ClassVar[str] = "placement_attempted"
    depth: int
    placement: Placement
    placements: tuple[Placement, ...]
    remaining: tuple[str, ...]


@dataclass(frozen=True)
class PlacementAccepted(SolverEvent):
    type: ClassVar[str] = "placement_accepted"
    depth: int
    placement: Placement
    placements: tuple[Placement, ...]
    remaining: tuple[str, ...]


@dataclass(frozen=True)
class PlacementRejected(SolverEvent):
    type: ClassVar[str] = "placement_rejected"
    depth: int
    placement: Placement
    reason: str  # board.OUT_OF_BOUNDS | board.OVERLAP
    placements: tuple[Placement, ...]
    remaining: tuple[str, ...]


@dataclass(frozen=True)
class BacktrackStarted(SolverEvent):
    """The subtree under `placement` is exhausted; it is about to be removed."""

    type: ClassVar[str] = "backtrack_started"
    depth: int
    placement: Placement
    placements: tuple[Placement, ...]
    remaining: tuple[str, ...]


@dataclass(frozen=True)
class BacktrackCompleted(SolverEvent):
    type: ClassVar[str] = "backtrack_completed"
    depth: int
    removed: Placement
    placements: tuple[Placement, ...]
    remaining: tuple[str, ...]


@dataclass(frozen=True)
class SolutionFound(SolverEvent):
    type: ClassVar[str] = "solution_found"
    solution_index: int  # 0-based
    solution: Solution


@dataclass(frozen=True)
class SearchCompleted(SolverEvent):
    type: ClassVar[str] = "search_completed"
    status: str
    solutions_found: int
    metrics: SolverMetrics
    message: str | None = None


ALL_EVENT_TYPES: tuple[type[SolverEvent], ...] = (
    SolverStarted,
    PieceSelected,
    PlacementAttempted,
    PlacementAccepted,
    PlacementRejected,
    BacktrackStarted,
    BacktrackCompleted,
    SolutionFound,
    SearchCompleted,
)


def replay_placements(events: Iterable[SolverEvent]) -> Iterator[tuple[SolverEvent, tuple[Placement, ...]]]:
    """Rebuild the board state after each event from accepted/backtrack events alone.

    Yields (event, placements-as-of-that-event). This is the reference replay a
    frontend must reproduce when it receives compact events.
    """
    stack: list[Placement] = []
    for ev in events:
        if isinstance(ev, PlacementAccepted):
            stack.append(ev.placement)
        elif isinstance(ev, BacktrackCompleted):
            stack.pop()
        yield ev, tuple(stack)
