import pytest

from edison_puzzle.analysis import MAX_BOARD_SIDE, MAX_PIECES, analyze_puzzle_input


def good(**over):
    d = {
        "name": "Mine",
        "board": {"width": 4, "height": 4},
        "pieces": [{"width": 2, "height": 4}, {"width": 2, "height": 4}],
        "allowRotation": True,
    }
    d.update(over)
    return d


def codes(a, sev=None):
    return [i.code for i in a.issues if sev is None or i.severity == sev]


def test_valid_puzzle_can_be_saved_and_is_not_declared_impossible():
    a = analyze_puzzle_input(good())
    assert a.can_save and a.solvability == "unknown" and a.config is not None
    assert (a.board_area, a.pieces_area) == (16, 16)
    assert a.to_dict()["areaDifference"] == 0


@pytest.mark.parametrize(
    "pieces,code,diff",
    [
        ([{"width": 2, "height": 4}], "area_too_small", -8),
        ([{"width": 4, "height": 4}, {"width": 1, "height": 1}], "area_too_large", 1),
    ],
)
def test_area_mismatch_is_an_error_with_exact_numbers(pieces, code, diff):
    a = analyze_puzzle_input(good(pieces=pieces))
    assert code in codes(a, "error") and not a.can_save and a.solvability == "impossible"
    assert a.to_dict()["areaDifference"] == diff
    msg = next(i.message for i in a.issues if i.code == code)
    assert str(abs(diff)) in msg


def test_piece_too_large_even_when_rotated():
    a = analyze_puzzle_input(
        good(board={"width": 4, "height": 3}, pieces=[{"width": 5, "height": 2}, {"width": 2, "height": 1}])
    )
    assert "piece_too_large" in codes(a, "error")


def test_piece_that_only_fits_rotated_is_ok_with_rotation_but_not_without():
    pieces = [{"width": 4, "height": 2}, {"width": 4, "height": 1}]  # on a 2-wide, 6-tall board
    board = {"width": 2, "height": 6}
    on = analyze_puzzle_input(good(board=board, pieces=pieces, allowRotation=True))
    assert on.can_save and "needs_rotation" in codes(on, "info")
    off = analyze_puzzle_input(good(board=board, pieces=pieces, allowRotation=False))
    assert not off.can_save and "piece_too_large" in codes(off, "error")


@pytest.mark.parametrize(
    "board",
    [
        {"width": 0, "height": 4},
        {"width": -1, "height": 4},
        {"width": 2.5, "height": 4},
        {"width": True, "height": 4},
        {"width": "4", "height": 4},
        {},
        None,
        "x",
    ],
)
def test_invalid_board_rejected(board):
    a = analyze_puzzle_input(good(board=board))
    assert "invalid_board" in codes(a, "error") and not a.can_save


def test_board_and_piece_count_limits():
    a = analyze_puzzle_input(good(board={"width": MAX_BOARD_SIDE + 1, "height": 4}))
    assert "board_too_large" in codes(a)
    many = [{"width": 1, "height": 1}] * (MAX_PIECES + 1)
    assert "too_many_pieces" in codes(analyze_puzzle_input(good(pieces=many)))
    ok = [{"width": 1, "height": 1}] * MAX_PIECES
    assert "too_many_pieces" not in codes(analyze_puzzle_input(good(board={"width": 6, "height": 5}, pieces=ok)))


@pytest.mark.parametrize(
    "piece",
    [
        {"width": 0, "height": 2},
        {"width": 2, "height": -3},
        {"width": 1.5, "height": 2},
        {"width": "2", "height": 2},
        {"width": 2},
        "nope",
        None,
    ],
)
def test_invalid_piece_rejected(piece):
    a = analyze_puzzle_input(good(pieces=[piece]))
    assert "invalid_piece" in codes(a, "error") and not a.can_save


def test_no_pieces_and_missing_name():
    assert "no_pieces" in codes(analyze_puzzle_input(good(pieces=[])))
    assert "name_required" in codes(analyze_puzzle_input(good(name="   ")))
    assert "name_too_long" in codes(analyze_puzzle_input(good(name="x" * 81)))


def test_duplicate_explicit_ids():
    a = analyze_puzzle_input(good(pieces=[{"id": "a", "width": 2, "height": 4}, {"id": "a", "width": 2, "height": 4}]))
    assert "duplicate_id" in codes(a, "error")


def test_ids_are_generated_when_missing():
    a = analyze_puzzle_input(good())
    assert [p.id for p in a.config.pieces] == ["r01", "r02"]


def test_non_object_input():
    assert not analyze_puzzle_input([1, 2]).can_save
    assert not analyze_puzzle_input(None).can_save


def test_identical_pieces_are_reported_as_info():
    a = analyze_puzzle_input(good())
    assert "identical_pieces" in codes(a, "info")


def test_all_problems_reported_together():
    a = analyze_puzzle_input({"name": "", "board": {"width": 0, "height": 2}, "pieces": [{"width": 0, "height": 1}]})
    assert {"name_required", "invalid_board", "invalid_piece"} <= set(codes(a))


def test_non_solvability_errors_do_not_claim_impossible():
    a = analyze_puzzle_input(good(name=""))
    assert not a.can_save and "name_required" in codes(a, "error")
    assert a.solvability == "unknown"


def test_overlong_piece_id_is_rejected():
    a = analyze_puzzle_input(good(pieces=[{"id": "a" * 65, "width": 2, "height": 4}, {"width": 2, "height": 4}]))
    assert not a.can_save and "invalid_piece" in codes(a, "error")
    ok = analyze_puzzle_input(good(pieces=[{"id": "a" * 64, "width": 2, "height": 4}, {"width": 2, "height": 4}]))
    assert ok.can_save
