"""Board symmetries and solution families.

A tiling of a rectangular board can be rotated/reflected into other tilings.
Square boards have 8 such symmetries (the dihedral group D4); non-square
boards keep only the 4 that preserve the board's dimensions.

Solutions that are images of each other under these maps belong to one
*family*: they are the same arrangement seen from a different orientation, not
a fundamentally different solution.

Interchangeable pieces (same dimensions) are not distinguished: geometry is
compared as a set of (x, y, width, height) rectangles.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass

from .models import Placement, PuzzleConfig, Solution

Rect = tuple[int, int, int, int]  # x, y, width, height
Geometry = frozenset[Rect]

IDENTITY = "identity"
FLIP_HORIZONTAL = "flip_horizontal"  # mirror left <-> right
FLIP_VERTICAL = "flip_vertical"  # mirror top <-> bottom
ROTATE_180 = "rotate_180"
TRANSPOSE = "transpose"  # reflect across the main diagonal
ROTATE_90_CW = "rotate_90_cw"
ROTATE_90_CCW = "rotate_90_ccw"
ANTI_TRANSPOSE = "anti_transpose"  # reflect across the anti-diagonal

LABELS = {
    IDENTITY: "Identical",
    FLIP_HORIZONTAL: "Mirrored left-right",
    FLIP_VERTICAL: "Mirrored top-bottom",
    ROTATE_180: "Rotated 180°",
    TRANSPOSE: "Reflected across the main diagonal",
    ROTATE_90_CW: "Rotated 90° clockwise",
    ROTATE_90_CCW: "Rotated 90° counter-clockwise",
    ANTI_TRANSPOSE: "Reflected across the anti-diagonal",
}

_PRESERVING = (IDENTITY, FLIP_HORIZONTAL, FLIP_VERTICAL, ROTATE_180)
_SQUARE_ONLY = (TRANSPOSE, ROTATE_90_CW, ROTATE_90_CCW, ANTI_TRANSPOSE)


def transforms_for(board_width: int, board_height: int) -> tuple[str, ...]:
    return _PRESERVING + (_SQUARE_ONLY if board_width == board_height else ())


def transform_rect(name: str, rect: Rect, board_width: int, board_height: int) -> Rect:
    x, y, w, h = rect
    W, H = board_width, board_height
    maps: dict[str, Callable[[], Rect]] = {
        IDENTITY: lambda: (x, y, w, h),
        FLIP_HORIZONTAL: lambda: (W - x - w, y, w, h),
        FLIP_VERTICAL: lambda: (x, H - y - h, w, h),
        ROTATE_180: lambda: (W - x - w, H - y - h, w, h),
        TRANSPOSE: lambda: (y, x, h, w),
        ROTATE_90_CW: lambda: (H - y - h, x, h, w),
        ROTATE_90_CCW: lambda: (y, W - x - w, h, w),
        ANTI_TRANSPOSE: lambda: (H - y - h, W - x - w, h, w),
    }
    if name not in maps:
        raise ValueError(f"unknown transform {name!r}")
    if name in _SQUARE_ONLY and W != H:
        raise ValueError(f"transform {name!r} needs a square board")
    return maps[name]()


def geometry(placements: Iterable[Placement]) -> Geometry:
    return frozenset((p.x, p.y, p.width, p.height) for p in placements)


def transform_geometry(name: str, geom: Geometry, board_width: int, board_height: int) -> Geometry:
    return frozenset(transform_rect(name, r, board_width, board_height) for r in geom)


def transform_solution(puzzle: PuzzleConfig, solution: Solution, name: str) -> Solution:
    """Apply a symmetry; piece ids and `rotated` flags are kept consistent with the puzzle."""
    out = []
    for p in solution.placements:
        x, y, w, h = transform_rect(name, (p.x, p.y, p.width, p.height), puzzle.board_width, puzzle.board_height)
        rect = puzzle.piece(p.piece_id)
        out.append(Placement(p.piece_id, x, y, w, h, (not rect.is_square) and (w, h) != (rect.width, rect.height)))
    return Solution(solution.puzzle_id, tuple(out))


@dataclass(frozen=True)
class FamilyMember:
    solution_index: int
    transform: str  # maps the family's canonical solution onto this one

    def to_dict(self) -> dict[str, object]:
        return {"solutionIndex": self.solution_index, "transform": self.transform, "label": LABELS[self.transform]}


@dataclass(frozen=True)
class Family:
    family_id: int
    canonical_index: int
    members: tuple[FamilyMember, ...]
    # Number of distinct images the canonical arrangement has under the board's
    # symmetries (< len(transforms) when the arrangement is itself symmetric).
    distinct_images: int

    def to_dict(self) -> dict[str, object]:
        return {
            "familyId": self.family_id,
            "canonicalIndex": self.canonical_index,
            "members": [m.to_dict() for m in self.members],
            "distinctImages": self.distinct_images,
        }


def classify(puzzle: PuzzleConfig, solutions: Sequence[Solution]) -> list[Family]:
    """Group solutions into families. Canonical = lowest index in each family."""
    W, H = puzzle.board_width, puzzle.board_height
    names = transforms_for(W, H)
    geoms = [geometry(s.placements) for s in solutions]
    assigned: dict[int, tuple[int, str]] = {}  # solution index -> (canonical index, transform)
    families: list[Family] = []
    for i, g in enumerate(geoms):
        if i in assigned:
            continue
        images: dict[Geometry, str] = {}
        for n in names:
            images.setdefault(transform_geometry(n, g, W, H), n)  # first transform wins
        members = [FamilyMember(i, IDENTITY)]
        assigned[i] = (i, IDENTITY)
        for j in range(i + 1, len(geoms)):
            if j not in assigned and geoms[j] in images:
                assigned[j] = (i, images[geoms[j]])
                members.append(FamilyMember(j, images[geoms[j]]))
        families.append(Family(len(families), i, tuple(members), len(images)))
    return families
