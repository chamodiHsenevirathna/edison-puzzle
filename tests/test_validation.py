import pytest

from conftest import make_puzzle
from edison_puzzle import Placement, SolverOptions, original_puzzle, solve, validate_solution


def P(pid, x, y, w, h, rot=False):
    return Placement(pid, x, y, w, h, rot)


def codes(result):
    return sorted(e.code for e in result.errors)


@pytest.fixture
def quad():
    # 4x2 board: a(2x2) next to b(2x2)... plus a rotatable bar
    return make_puzzle(4, 3, [(2, 2), (2, 2), (4, 1)])


def valid_quad():
    return [P("p1", 0, 0, 2, 2), P("p2", 2, 0, 2, 2), P("p3", 0, 2, 4, 1)]


def test_valid_solution(quad):
    r = validate_solution(quad, valid_quad())
    assert r.valid and r.errors == ()


def test_valid_solution_with_rotated_piece():
    puz = make_puzzle(3, 4, [(4, 1), (2, 4)])
    r = validate_solution(puz, [P("p1", 0, 0, 1, 4, True), P("p2", 1, 0, 2, 4)])
    assert r.valid


def test_empty_solution_reports_everything_missing(quad):
    r = validate_solution(quad, [])
    assert not r.valid
    assert codes(r) == ["missing_piece"] * 3 + ["uncovered_cells"]


def test_missing_piece(quad):
    r = validate_solution(quad, valid_quad()[:2])
    assert codes(r) == ["missing_piece", "uncovered_cells"]
    assert [e.piece_id for e in r.errors if e.code == "missing_piece"] == ["p3"]


def test_unknown_piece(quad):
    sol = valid_quad() + [P("ghost", 0, 0, 1, 1)]
    r = validate_solution(quad, sol)
    assert codes(r) == ["unknown_piece"]


def test_duplicate_piece_placement(quad):
    sol = valid_quad() + [P("p1", 0, 2, 2, 2)]
    r = validate_solution(quad, sol)
    assert "duplicate_piece" in codes(r)
    assert not r.valid


def test_wrong_dimensions(quad):
    sol = [P("p1", 0, 0, 3, 2), P("p2", 2, 0, 2, 2), P("p3", 0, 2, 4, 1)]
    assert "dimension_mismatch" in codes(validate_solution(quad, sol))


def test_out_of_bounds(quad):
    sol = [P("p1", 0, 0, 2, 2), P("p2", 3, 0, 2, 2), P("p3", 0, 2, 4, 1)]
    r = validate_solution(quad, sol)
    assert "out_of_bounds" in codes(r)


def test_negative_coordinate_is_out_of_bounds(quad):
    sol = [P("p1", -1, 0, 2, 2), P("p2", 2, 0, 2, 2), P("p3", 0, 2, 4, 1)]
    assert "out_of_bounds" in codes(validate_solution(quad, sol))


def test_overlap_detected_and_reports_gap_too(quad):
    sol = [P("p1", 0, 0, 2, 2), P("p2", 1, 0, 2, 2), P("p3", 0, 2, 4, 1)]
    r = validate_solution(quad, sol)
    assert "overlap" in codes(r)
    assert "uncovered_cells" in codes(r)  # column 3 rows 0-1 are empty
    assert not r.valid


def test_rotation_flag_must_match_dimensions(quad):
    sol = [P("p1", 0, 0, 2, 2), P("p2", 2, 0, 2, 2), P("p3", 0, 2, 4, 1, True)]
    assert "rotation_flag_mismatch" in codes(validate_solution(quad, sol))


def test_square_piece_rotation_flag_is_not_an_error(quad):
    sol = [P("p1", 0, 0, 2, 2, True), P("p2", 2, 0, 2, 2), P("p3", 0, 2, 4, 1)]
    assert validate_solution(quad, sol).valid


def test_rotation_forbidden_when_disabled():
    puz = make_puzzle(1, 4, [(4, 1)], allow_rotation=False)
    r = validate_solution(puz, [P("p1", 0, 0, 1, 4, True)])
    assert codes(r) == ["rotation_not_allowed"]
    assert validate_solution(make_puzzle(1, 4, [(4, 1)]), [P("p1", 0, 0, 1, 4, True)]).valid


def test_placement_order_does_not_matter(quad):
    assert validate_solution(quad, list(reversed(valid_quad()))).valid


def test_error_serialisation():
    puz = make_puzzle(2, 2, [(2, 2)])
    d = validate_solution(puz, []).to_dict()
    assert d["valid"] is False
    assert {"code": "missing_piece", "message": "piece 'p1' is not placed", "pieceId": "p1"} in d["errors"]


# ------------------------------------------------- original puzzle regressions
def original_solution_placements(puz):
    """A tiling of the original puzzle found by this project's own solver (about 15 ms)."""
    result = solve(puz, SolverOptions(max_solutions=1))
    assert len(result.solutions) == 1
    return list(result.solutions[0].placements)


def test_solver_output_for_the_original_puzzle_passes_the_independent_validator():
    puz = original_puzzle()
    assert validate_solution(puz, original_solution_placements(puz)).valid


def test_moving_one_piece_of_a_valid_original_solution_invalidates_it():
    puz = original_puzzle()
    base = original_solution_placements(puz)
    for i in range(len(base)):
        moved = list(base)
        old = moved[i]
        moved[i] = Placement(old.piece_id, old.x + 1, old.y, old.width, old.height, old.rotated)
        assert not validate_solution(puz, moved).valid, f"shifting {old.piece_id} should break the tiling"


def test_dropping_any_piece_from_a_valid_original_solution_invalidates_it():
    puz = original_puzzle()
    base = original_solution_placements(puz)
    for i in range(len(base)):
        r = validate_solution(puz, base[:i] + base[i + 1 :])
        assert "missing_piece" in codes(r) and "uncovered_cells" in codes(r)
