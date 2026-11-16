from collections import Counter

import pytest

from edison_puzzle import SolverOptions, original_puzzle, solve, validate_solution

# The original puzzle's twelve rectangles (their areas sum to 56 x 56 = 3136), written
# out here on purpose rather than imported from catalog.py, so the test checks the
# catalog against an independent statement of the puzzle definition.
ORIGINAL_PIECES = [
    (28, 14),
    (21, 18),
    (21, 18),
    (21, 14),
    (21, 14),
    (32, 11),
    (32, 10),
    (28, 7),
    (28, 6),
    (17, 14),
    (14, 4),
    (10, 7),
]


def test_board_is_56_by_56():
    p = original_puzzle()
    assert (p.board_width, p.board_height) == (56, 56)


def test_has_all_twelve_original_rectangles_exactly():
    p = original_puzzle()
    assert len(p.pieces) == 12
    assert Counter((r.width, r.height) for r in p.pieces) == Counter(ORIGINAL_PIECES)
    assert [(r.width, r.height) for r in p.pieces] == ORIGINAL_PIECES  # same order too


def test_piece_ids_are_unique_and_rotation_is_allowed():
    p = original_puzzle()
    assert len({r.id for r in p.pieces}) == 12
    assert p.allow_rotation


def test_areas_balance_exactly():
    p = original_puzzle()
    assert p.pieces_area == 3136 == 56 * 56
    assert p.is_area_balanced


def test_solver_finds_a_valid_tiling():
    p = original_puzzle()
    r = solve(p)
    assert r.status == "max_solutions" and len(r.solutions) == 1
    sol = r.solutions[0]
    assert len(sol.placements) == 12
    assert validate_solution(p, sol.placements).valid


@pytest.mark.slow  # ~20 s: the 2nd/3rd solutions are far apart in the search tree
def test_several_distinct_solutions_exist_and_are_all_valid():
    p = original_puzzle()
    r = solve(p, SolverOptions(max_solutions=3))
    assert len(r.solutions) == 3
    geoms = {frozenset((q.x, q.y, q.width, q.height) for q in s.placements) for s in r.solutions}
    assert len(geoms) == 3
    assert all(validate_solution(p, s.placements).valid for s in r.solutions)


@pytest.mark.slow  # ~65 s exhaustive search
def test_exhaustive_search_finds_one_solution_up_to_board_symmetry():
    N = 56
    p = original_puzzle()
    r = solve(p, SolverOptions(max_solutions=None))
    assert r.status == "exhausted"
    assert len(r.solutions) == 8
    assert all(validate_solution(p, s.placements).valid for s in r.solutions)

    geoms = [frozenset((q.x, q.y, q.width, q.height) for q in s.placements) for s in r.solutions]
    syms = [
        lambda x, y, w, h: (x, y, w, h),
        lambda x, y, w, h: (N - x - w, y, w, h),
        lambda x, y, w, h: (x, N - y - h, w, h),
        lambda x, y, w, h: (N - x - w, N - y - h, w, h),
        lambda x, y, w, h: (y, x, h, w),
        lambda x, y, w, h: (N - y - h, x, h, w),
        lambda x, y, w, h: (y, N - x - w, h, w),
        lambda x, y, w, h: (N - y - h, N - x - w, h, w),
    ]
    classes = {frozenset(frozenset(f(*t) for t in g) for f in syms) for g in geoms}
    assert len(set(geoms)) == 8 and len(classes) == 1
