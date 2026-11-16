"""Bounded solver execution for the API: limit clamping, concurrency cap,
synchronous solve and the cancellable SSE event stream."""

from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from fastapi import Request

from edison_puzzle import PuzzleConfig, Solver, SolverOptions
from edison_puzzle.events import (
    STATUS_EVENT_LIMIT,
    SearchCompleted,
    SolutionFound,
    SolverEvent,
)
from edison_puzzle.models import Solution

from .config import Settings


class Slots:
    """Non-blocking concurrency cap for CPU-bound searches."""

    def __init__(self, n: int) -> None:
        self._n = n
        self._used = 0
        self._lock = threading.Lock()

    def try_acquire(self) -> bool:
        with self._lock:
            if self._used >= self._n:
                return False
            self._used += 1
            return True

    def release(self) -> None:
        with self._lock:
            self._used = max(0, self._used - 1)

    def available(self) -> bool:
        with self._lock:
            return self._used < self._n


@dataclass(frozen=True)
class Limits:
    max_solutions: int | None
    max_nodes: int
    time_limit_s: float
    max_events: int

    def options(self, trace: bool) -> SolverOptions:
        return SolverOptions(
            max_solutions=self.max_solutions, trace=trace, max_nodes=self.max_nodes, time_limit_s=self.time_limit_s
        )


def clamp(
    settings: Settings,
    *,
    max_solutions: int | None,
    max_nodes: int | None,
    time_limit_s: float | None,
    max_events: int | None,
) -> Limits:
    return Limits(
        max_solutions=max_solutions,
        max_nodes=min(max_nodes or settings.default_max_nodes, settings.hard_max_nodes),
        time_limit_s=min(time_limit_s or settings.default_time_limit_s, settings.hard_time_limit_s),
        max_events=min(max_events or settings.default_max_events, settings.hard_max_events),
    )


def run_sync(puzzle: PuzzleConfig, limits: Limits, events_mode: str) -> tuple[dict[str, Any], list[Solution], bool]:
    """Run to completion (or a limit). Returns (response body, solutions, exhausted)."""
    trace = events_mode == "full"
    solver = Solver(puzzle, limits.options(trace))
    solutions: list[Solution] = []
    events: list[dict[str, Any]] = []
    final: SearchCompleted | None = None
    truncated = False
    forced_status: str | None = None
    for ev in solver.run():
        if isinstance(ev, SolutionFound):
            solutions.append(ev.solution)
        if isinstance(ev, SearchCompleted):
            final = ev
        if events_mode != "none" and not truncated:
            if len(events) >= limits.max_events and not isinstance(ev, SearchCompleted):
                truncated = True
                forced_status = STATUS_EVENT_LIMIT
                solver.cancel()
            else:
                events.append(ev.to_dict(compact=trace))
    assert final is not None
    body: dict[str, Any] = {
        "puzzleId": puzzle.id,
        "status": forced_status or final.status,
        "solutions": [s.to_dict() for s in solutions],
        "metrics": final.metrics.to_dict(),
        "message": final.message,
    }
    if events_mode != "none":
        body["events"] = events
        body["eventsTruncated"] = truncated
        body["eventsCompact"] = trace
    return body, solutions, final.status == "exhausted" and forced_status is None


def sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


async def stream(
    request: Request, puzzle: PuzzleConfig, limits: Limits, slots: Slots, *, trace: bool, compact: bool, batch_size: int
) -> AsyncIterator[str]:
    """Yield SSE frames: `events` (batches), then one `done`. Stops the search if the client disconnects."""
    if not slots.try_acquire():
        yield sse("error", {"code": "solver_busy", "message": "The solver is busy. Try again in a moment."})
        return
    solver = Solver(puzzle, limits.options(trace))
    it = solver.run()

    def next_batch() -> tuple[list[SolverEvent], bool]:
        out: list[SolverEvent] = []
        try:
            while len(out) < batch_size:
                out.append(next(it))
        except StopIteration:
            return out, True
        return out, False

    sent = 0
    truncated = False
    final: SearchCompleted | None = None
    try:
        done = False
        idle = 0.0
        while not done:
            task = asyncio.create_task(asyncio.to_thread(next_batch))
            while not task.done():
                await asyncio.wait({task}, timeout=0.1)
                if await request.is_disconnected():
                    solver.cancel()
                    await task
                    return
                idle += 0.1
                if idle >= 5 and not task.done():
                    idle = 0.0
                    yield ": keepalive\n\n"
            batch, done = task.result()
            idle = 0.0
            out: list[dict[str, Any]] = []
            for ev in batch:
                if isinstance(ev, SearchCompleted):
                    final = ev
                if truncated:
                    continue
                if sent >= limits.max_events and not isinstance(ev, SearchCompleted):
                    truncated = True
                    solver.cancel()
                    continue
                out.append(ev.to_dict(compact=compact))
                sent += 1
            if out:
                yield sse("events", out)
        assert final is not None
        yield sse(
            "done",
            {
                "status": STATUS_EVENT_LIMIT if truncated else final.status,
                "solutionsFound": final.solutions_found,
                "metrics": final.metrics.to_dict(),
                "message": final.message,
                "eventsSent": sent,
                "truncated": truncated,
            },
        )
    finally:
        solver.cancel()
        slots.release()
