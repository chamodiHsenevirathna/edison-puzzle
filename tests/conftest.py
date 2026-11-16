import pytest

from edison_puzzle import PuzzleConfig, Rectangle


def make_puzzle(board_w, board_h, dims, allow_rotation=True, pid="t"):
    """dims: list of (w, h); ids are p1, p2, ..."""
    return PuzzleConfig(
        id=pid,
        name=pid,
        board_width=board_w,
        board_height=board_h,
        pieces=tuple(Rectangle(f"p{i + 1}", w, h) for i, (w, h) in enumerate(dims)),
        allow_rotation=allow_rotation,
    )


@pytest.fixture
def mk():
    return make_puzzle
