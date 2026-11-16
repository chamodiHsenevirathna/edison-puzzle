import random

import pytest

from conftest import make_puzzle
from edison_puzzle import Solver, SolverOptions, solve, validate_solution
from oracle import all_tilings, geometry


def find_all(puz, **kw):
    return solve(puz, SolverOptions(max_solutions=None, **kw))


# --------------------------------------------------------- trivial & known counts
def test_single_piece_equal_to_board():
    puz = make_puzzle(3, 5, [(3, 5)])
    r = solve(puz)
    assert r.status == "max_solutions" and len(r.solutions) == 1
    assert geometry(r.solutions[0]) == {(0, 0, 3, 5)}


def test_single_piece_needs_rotation_to_fit():
    puz = make_puzzle(2, 5, [(5, 2)])
    r = solve(puz)
    (pl,) = r.solutions[0].placements
    assert (pl.width, pl.height, pl.rotated) == (2, 5, True)


def test_rotation_disabled_makes_that_puzzle_unsolvable():
    puz = make_puzzle(2, 5, [(5, 2)], allow_rotation=False)
    r = solve(puz)
    assert r.status == "exhausted" and r.solutions == []


def test_square_piece_is_never_reported_rotated():
    r = solve(make_puzzle(3, 3, [(3, 3)]))
    assert r.solutions[0].placements[0].rotated is False


@pytest.mark.parametrize(
    "bw,bh,n_dominoes,expected",
    [
        (2, 2, 2, 2),  # known: 2 domino tilings of a 2x2
        (2, 3, 3, 3),  # known: 3
        (3, 2, 3, 3),
        (4, 2, 4, 5),  # known: 5 (Fibonacci)
        (4, 4, 8, 36),  # known: 36
    ],
)
def test_domino_tiling_counts_match_known_values(bw, bh, n_dominoes, expected):
    r = find_all(make_puzzle(bw, bh, [(1, 2)] * n_dominoes))
    assert r.status == "exhausted"
    assert len(r.solutions) == expected
    assert len({geometry(s) for s in r.solutions}) == expected  # all distinct


def test_odd_board_with_dominoes_has_no_tiling_even_though_search_runs():
    # 3x3 has area 9, so 4 dominoes (area 8) is unbalanced -> rejected up front.
    r = find_all(make_puzzle(3, 3, [(1, 2)] * 4))
    assert r.status == "not_solvable" and r.metrics.nodes_visited == 0


# ------------------------------------------------------------------ unsolvable
def test_equal_area_but_geometrically_impossible():
    # 4 cells either way, but a 1x4 bar cannot fit in a 2x2 board.
    r = solve(make_puzzle(2, 2, [(1, 4)]))
    assert r.status == "exhausted" and r.solutions == [] and r.metrics.nodes_visited >= 1


def test_equal_area_two_pieces_impossible():
    # Areas 4+4+1 = 9 = 3x3, but two 2x2 squares cannot both fit in a 3x3 board.
    r = find_all(make_puzzle(3, 3, [(2, 2), (2, 2), (1, 1)]))
    assert r.status == "exhausted" and r.solutions == []


def test_area_mismatch_is_reported_not_searched():
    r = solve(make_puzzle(4, 4, [(2, 2)] * 3))
    assert r.status == "not_solvable"
    assert r.solutions == [] and r.metrics.nodes_visited == 0


# --------------------------------------------------- completeness vs. oracle
# All area-balanced. The oracle count is non-zero for most, and zero for the
# "3x3 with two 2x2 squares" case, so both outcomes are exercised.
CASES = [
    (4, 3, [(2, 2), (1, 2), (1, 2), (1, 2), (1, 2)]),
    (5, 4, [(5, 2), (3, 2), (2, 2)]),
    (5, 5, [(3, 3), (2, 3), (3, 2), (2, 2)]),  # pinwheel-style
    (6, 4, [(3, 2)] * 4),
    (4, 4, [(2, 2)] * 2 + [(1, 2)] * 4),
    (5, 3, [(3, 1), (3, 2), (2, 1), (2, 2)]),
    (4, 4, [(2, 2), (2, 2), (4, 1), (4, 1)]),
    (3, 3, [(2, 2), (2, 2), (1, 1)]),  # balanced but untileable
]


@pytest.mark.parametrize("bw,bh,dims", CASES)
@pytest.mark.parametrize("rot", [True, False])
def test_solver_finds_exactly_the_tilings_the_oracle_finds(bw, bh, dims, rot):
    puz = make_puzzle(bw, bh, dims, allow_rotation=rot)
    expected = all_tilings(bw, bh, dims, rot)
    r = find_all(puz)
    got = {geometry(s) for s in r.solutions}
    assert r.status in ("exhausted", "not_solvable")
    assert got == expected
    assert len(r.solutions) == len(got)  # no duplicate geometries emitted
    for s in r.solutions:
        assert validate_solution(puz, s.placements).valid


def random_guillotine_dims(rng, bw, bh, pieces):
    """Split a board into `pieces` rectangles by random guillotine cuts => solvable by construction."""
    rects = [(bw, bh)]
    while len(rects) < pieces:
        splittable = [i for i, (w, h) in enumerate(rects) if w > 1 or h > 1]
        if not splittable:
            break
        i = rng.choice(splittable)
        w, h = rects.pop(i)
        if w > 1 and (h == 1 or rng.random() < 0.5):
            c = rng.randint(1, w - 1)
            rects += [(c, h), (w - c, h)]
        else:
            c = rng.randint(1, h - 1)
            rects += [(w, c), (w, h - c)]
    return [(h, w) if rng.random() < 0.5 else (w, h) for w, h in rects]  # scramble orientation


@pytest.mark.parametrize("seed", range(40))
def test_solver_solves_randomly_generated_solvable_puzzles(seed):
    rng = random.Random(seed)
    bw, bh = rng.randint(4, 16), rng.randint(4, 16)
    dims = random_guillotine_dims(rng, bw, bh, rng.randint(2, 9))
    rng.shuffle(dims)
    puz = make_puzzle(bw, bh, dims)
    assert puz.is_area_balanced
    r = solve(puz)
    assert len(r.solutions) == 1, f"solver missed a tiling that provably exists: {puz.to_dict()}"
    assert validate_solution(puz, r.solutions[0].placements).valid


# ---------------------------------------------------------------------- options
def test_max_solutions_stops_early():
    puz = make_puzzle(4, 4, [(1, 2)] * 8)
    r = solve(puz, SolverOptions(max_solutions=5))
    assert r.status == "max_solutions" and len(r.solutions) == 5


def test_max_solutions_larger_than_available_exhausts():
    r = solve(make_puzzle(2, 2, [(1, 2)] * 2), SolverOptions(max_solutions=10))
    assert r.status == "exhausted" and len(r.solutions) == 2


def test_node_limit_stops_search_and_is_reported():
    puz = make_puzzle(4, 4, [(1, 2)] * 8)
    r = solve(puz, SolverOptions(max_solutions=None, max_nodes=10))
    assert r.status == "node_limit"
    assert r.metrics.nodes_visited == 10
    assert len(r.solutions) < 36


def test_time_limit_is_reported():
    from edison_puzzle import original_puzzle

    r = solve(original_puzzle(), SolverOptions(max_solutions=None, time_limit_s=0.2))
    assert r.status == "time_limit"
    assert all(validate_solution(original_puzzle(), s.placements).valid for s in r.solutions)


@pytest.mark.parametrize("kw", [dict(max_solutions=0), dict(max_nodes=0), dict(time_limit_s=0)])
def test_invalid_options_rejected(kw):
    with pytest.raises(ValueError):
        SolverOptions(**kw)


def test_solver_is_deterministic():
    puz = make_puzzle(4, 4, [(1, 2)] * 8)
    a = [s.to_dict() for s in find_all(puz).solutions]
    b = [s.to_dict() for s in find_all(puz).solutions]
    assert a == b


def test_identical_pieces_get_ids_in_config_order():
    puz = make_puzzle(2, 1, [(1, 1), (1, 1)])
    (s,) = solve(puz).solutions
    assert [p.piece_id for p in sorted(s.placements, key=lambda p: p.x)] == ["p1", "p2"]


def test_events_are_lazy():
    from edison_puzzle import original_puzzle

    it = Solver(original_puzzle(), SolverOptions(trace=True)).run()
    first = next(it)
    assert first.type == "solver_started"
    assert next(it).type == "piece_selected"
