import pytest

from conftest import make_puzzle
from edison_puzzle import Placement, PuzzleConfig, PuzzleConfigError, Rectangle, Solution


@pytest.mark.parametrize("w,h", [(0, 3), (3, 0), (-1, 2), (2, -5), (2.5, 3), (True, 3)])
def test_rectangle_rejects_non_positive_or_non_integer_dimensions(w, h):
    with pytest.raises(PuzzleConfigError):
        Rectangle("a", w, h)


def test_rectangle_rejects_empty_id():
    with pytest.raises(PuzzleConfigError):
        Rectangle("", 1, 1)


def test_shape_key_ignores_orientation():
    assert Rectangle("a", 3, 5).shape_key == Rectangle("b", 5, 3).shape_key == (3, 5)


def test_puzzle_rejects_duplicate_piece_ids_and_empty_piece_list():
    with pytest.raises(PuzzleConfigError, match="duplicate"):
        PuzzleConfig("p", "p", 4, 4, (Rectangle("a", 2, 2), Rectangle("a", 2, 2)))
    with pytest.raises(PuzzleConfigError):
        PuzzleConfig("p", "p", 4, 4, ())


@pytest.mark.parametrize("bw,bh", [(0, 4), (4, 0), (-1, 4)])
def test_puzzle_rejects_bad_board_size(bw, bh):
    with pytest.raises(PuzzleConfigError):
        PuzzleConfig("p", "p", bw, bh, (Rectangle("a", 1, 1),))


def test_area_balance():
    assert make_puzzle(4, 4, [(2, 2)] * 4).is_area_balanced
    assert not make_puzzle(4, 4, [(2, 2)] * 3).is_area_balanced


def test_puzzle_round_trips_through_dict():
    p = make_puzzle(5, 3, [(5, 1), (5, 2)], allow_rotation=False)
    assert PuzzleConfig.from_dict(p.to_dict()) == p


def test_malformed_puzzle_dict_raises_config_error():
    with pytest.raises(PuzzleConfigError):
        PuzzleConfig.from_dict({"id": "x"})


def test_solution_round_trips_through_dict():
    s = Solution("t", (Placement("a", 0, 1, 2, 3, True),))
    assert Solution.from_dict(s.to_dict()) == s
