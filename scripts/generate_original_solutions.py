"""Regenerate src/edison_puzzle/data/original_solutions.json (exhaustive search, ~65 s).

The file is checked by tests/test_symmetry.py and tests/test_api.py; run this only if the engine's
solution ordering or the puzzle definition changes.
"""

import json
from pathlib import Path

from edison_puzzle import SolverOptions, original_puzzle, solve, validate_solution

OUT = Path(__file__).resolve().parent.parent / "src" / "edison_puzzle" / "data" / "original_solutions.json"


def main() -> None:
    puzzle = original_puzzle()
    result = solve(puzzle, SolverOptions(max_solutions=None))
    assert result.status == "exhausted", result.status
    assert all(validate_solution(puzzle, s.placements).valid for s in result.solutions)
    payload = {
        "puzzleId": puzzle.id,
        "exhaustive": True,
        "searchNodes": result.metrics.nodes_visited,
        "solutions": [s.to_dict() for s in result.solutions],
    }
    OUT.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"wrote {len(result.solutions)} solutions to {OUT}")


if __name__ == "__main__":
    main()
