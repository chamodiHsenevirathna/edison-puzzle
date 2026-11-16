"""Regenerate frontend/src/test/fixtures/trace.json from the real solver.

The frontend replay tests strip the snapshots from these events and check that
their own replay reproduces them, so the TypeScript and Python sides cannot
silently drift. Run from the repo root: python scripts/generate_frontend_fixtures.py
"""

import json
from pathlib import Path

from edison_puzzle import PuzzleConfig, Rectangle, Solver, SolverOptions

OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "test" / "fixtures" / "trace.json"


def main() -> None:
    dims = [(3, 1), (3, 2), (2, 1), (2, 2)]
    puzzle = PuzzleConfig(
        "fixture", "Fixture 5 x 3", 5, 3, tuple(Rectangle(f"r{i + 1:02d}", w, h) for i, (w, h) in enumerate(dims))
    )
    events = list(Solver(puzzle, SolverOptions(trace=True, max_solutions=None)).run())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"puzzle": puzzle.to_dict(), "events": [e.to_dict() for e in events]}, indent=None) + "\n"
    )
    print(f"wrote {len(events)} events to {OUT}")


if __name__ == "__main__":
    main()
