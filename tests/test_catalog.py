from collections import Counter

import pytest

from edison_puzzle import SolverOptions, solve, validate_solution
from edison_puzzle.catalog import ORIGINAL_PUZZLE_ID, builtin_puzzles, original_puzzle
from edison_puzzle.challenges import CHALLENGES


def test_ids_unique_and_original_first():
    ps = builtin_puzzles()
    assert ps[0].id == ORIGINAL_PUZZLE_ID
    assert len({p.id for p in ps}) == len(ps)


@pytest.mark.parametrize("p", builtin_puzzles(), ids=lambda p: p.id)
def test_every_builtin_is_balanced_and_solvable_by_a_validated_tiling(p):
    assert p.is_area_balanced
    r = solve(p, SolverOptions(time_limit_s=10))
    assert r.solutions and validate_solution(p, r.solutions[0].placements).valid


def test_original_spec_exactly():
    p = original_puzzle()
    assert (p.board_width, p.board_height, len(p.pieces)) == (56, 56, 12)
    assert Counter((r.width, r.height) for r in p.pieces) == Counter(
        {
            (28, 14): 1,
            (21, 18): 2,
            (21, 14): 2,
            (32, 11): 1,
            (32, 10): 1,
            (28, 7): 1,
            (28, 6): 1,
            (17, 14): 1,
            (14, 4): 1,
            (10, 7): 1,
        }
    )
    assert p.pieces_area == 3136 == 56 * 56


def test_fixed_orientation_warmup_really_needs_no_rotation():
    p = next(q for q in builtin_puzzles() if q.id == "warmup-24-fixed")
    assert not p.allow_rotation
    sol = solve(p).solutions[0]
    assert not any(pl.rotated for pl in sol.placements)


def test_original_really_needs_rotation():
    """Documented claim: the original cannot be solved with rotation disabled (so no 'no-spin' challenge on it)."""
    p = original_puzzle()
    fixed = type(p)(p.id, p.name, p.board_width, p.board_height, p.pieces, allow_rotation=False)
    r = solve(fixed, SolverOptions(max_solutions=1, time_limit_s=30))
    assert r.status in ("exhausted",) and r.solutions == []


def test_every_challenge_targets_a_builtin_puzzle():
    ids = {p.id for p in builtin_puzzles()}
    assert {c.puzzle_id for c in CHALLENGES} <= ids
