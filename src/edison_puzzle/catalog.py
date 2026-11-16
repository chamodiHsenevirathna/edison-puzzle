"""Built-in puzzle definitions."""

from __future__ import annotations

from .models import PuzzleConfig, Rectangle

ORIGINAL_PUZZLE_ID = "edison-original"

# The original puzzle's twelve rectangles as (width, height). Their areas sum to 56 x 56.
_ORIGINAL_DIMENSIONS: tuple[tuple[int, int], ...] = (
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
)


def original_puzzle() -> PuzzleConfig:
    """The original 56 x 56 puzzle with its 12 rectangles (rotation allowed)."""
    return PuzzleConfig(
        id=ORIGINAL_PUZZLE_ID,
        name="Edison Puzzle (original)",
        board_width=56,
        board_height=56,
        pieces=tuple(Rectangle(f"r{i + 1:02d}", w, h) for i, (w, h) in enumerate(_ORIGINAL_DIMENSIONS)),
        allow_rotation=True,
    )


# ---------------------------------------------------------------- warm-up puzzles
# Built by guillotine-cutting the board, so each has a tiling by construction;
# tests still verify solvability by running the solver.
def _make(pid: str, name: str, size: int, dims: tuple[tuple[int, int], ...], rotation: bool) -> PuzzleConfig:
    return PuzzleConfig(
        id=pid,
        name=name,
        board_width=size,
        board_height=size,
        pieces=tuple(Rectangle(f"r{i + 1:02d}", w, h) for i, (w, h) in enumerate(dims)),
        allow_rotation=rotation,
    )


def warmup_8() -> PuzzleConfig:
    return _make("warmup-8", "Warm-up 8 × 8", 8, ((8, 3), (5, 5), (3, 2), (3, 3)), True)


def warmup_16() -> PuzzleConfig:
    return _make("warmup-16", "Warm-up 16 × 16", 16, ((9, 6), (7, 6), (10, 4), (10, 6), (6, 4), (6, 6)), True)


def warmup_24_fixed() -> PuzzleConfig:
    return _make(
        "warmup-24-fixed",
        "Fixed orientation 24 × 24",
        24,
        ((14, 3), (14, 5), (10, 8), (15, 7), (8, 9), (7, 9), (9, 10), (9, 6)),
        False,
    )


def builtin_puzzles() -> tuple[PuzzleConfig, ...]:
    return (original_puzzle(), warmup_8(), warmup_16(), warmup_24_fixed())  # display order
