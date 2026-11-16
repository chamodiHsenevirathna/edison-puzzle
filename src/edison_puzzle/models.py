"""Core domain models. Pure data, no I/O, no framework dependencies.

Coordinate system: (0, 0) is the top-left cell; x grows right, y grows down.
This matches the original implementation (`grid[y][x]`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


class PuzzleConfigError(ValueError):
    """Raised when a puzzle configuration is structurally invalid."""


@dataclass(frozen=True)
class Rectangle:
    """A piece definition. `id` distinguishes pieces that share dimensions."""

    id: str
    width: int
    height: int

    def __post_init__(self) -> None:
        if not self.id:
            raise PuzzleConfigError("rectangle id must be non-empty")
        for name, v in (("width", self.width), ("height", self.height)):
            if isinstance(v, bool) or not isinstance(v, int) or v <= 0:
                raise PuzzleConfigError(f"rectangle {self.id!r}: {name} must be a positive integer, got {v!r}")

    @property
    def area(self) -> int:
        return self.width * self.height

    @property
    def shape_key(self) -> tuple[int, int]:
        """Orientation-independent shape: (short side, long side)."""
        return (min(self.width, self.height), max(self.width, self.height))

    @property
    def is_square(self) -> bool:
        return self.width == self.height

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "width": self.width, "height": self.height}

    @staticmethod
    def from_dict(d: dict[str, Any]) -> Rectangle:
        return Rectangle(id=d["id"], width=d["width"], height=d["height"])


@dataclass(frozen=True)
class Placement:
    """A piece placed on the board.

    `width`/`height` are the dimensions *as placed* (already swapped when
    `rotated` is true), so consumers never have to re-derive them.
    """

    piece_id: str
    x: int
    y: int
    width: int
    height: int
    rotated: bool = False

    @property
    def right(self) -> int:
        return self.x + self.width

    @property
    def bottom(self) -> int:
        return self.y + self.height

    def to_dict(self) -> dict[str, Any]:
        return {
            "pieceId": self.piece_id,
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "rotated": self.rotated,
        }

    @staticmethod
    def from_dict(d: dict[str, Any]) -> Placement:
        return Placement(
            piece_id=d["pieceId"],
            x=d["x"],
            y=d["y"],
            width=d["width"],
            height=d["height"],
            rotated=bool(d.get("rotated", False)),
        )


@dataclass(frozen=True)
class PuzzleConfig:
    """A tiling puzzle: place every piece exactly once so the board is fully covered."""

    id: str
    name: str
    board_width: int
    board_height: int
    pieces: tuple[Rectangle, ...]
    allow_rotation: bool = True

    def __post_init__(self) -> None:
        if not self.id:
            raise PuzzleConfigError("puzzle id must be non-empty")
        for name, v in (("board_width", self.board_width), ("board_height", self.board_height)):
            if isinstance(v, bool) or not isinstance(v, int) or v <= 0:
                raise PuzzleConfigError(f"{name} must be a positive integer, got {v!r}")
        object.__setattr__(self, "pieces", tuple(self.pieces))
        if not self.pieces:
            raise PuzzleConfigError("a puzzle needs at least one piece")
        ids = [p.id for p in self.pieces]
        if len(set(ids)) != len(ids):
            dupes = sorted({i for i in ids if ids.count(i) > 1})
            raise PuzzleConfigError(f"duplicate piece ids: {dupes}")

    @property
    def board_area(self) -> int:
        return self.board_width * self.board_height

    @property
    def pieces_area(self) -> int:
        return sum(p.area for p in self.pieces)

    @property
    def is_area_balanced(self) -> bool:
        """Necessary (not sufficient) condition for a tiling to exist."""
        return self.pieces_area == self.board_area

    def piece(self, piece_id: str) -> Rectangle:
        for p in self.pieces:
            if p.id == piece_id:
                return p
        raise KeyError(piece_id)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "board": {"width": self.board_width, "height": self.board_height},
            "pieces": [p.to_dict() for p in self.pieces],
            "allowRotation": self.allow_rotation,
        }

    @staticmethod
    def from_dict(d: dict[str, Any]) -> PuzzleConfig:
        try:
            return PuzzleConfig(
                id=d["id"],
                name=d.get("name", d["id"]),
                board_width=d["board"]["width"],
                board_height=d["board"]["height"],
                pieces=tuple(Rectangle.from_dict(p) for p in d["pieces"]),
                allow_rotation=bool(d.get("allowRotation", True)),
            )
        except (KeyError, TypeError) as e:
            raise PuzzleConfigError(f"malformed puzzle config: {e!r}") from e


@dataclass(frozen=True)
class Solution:
    puzzle_id: str
    placements: tuple[Placement, ...]

    def to_dict(self) -> dict[str, Any]:
        return {"puzzleId": self.puzzle_id, "placements": [p.to_dict() for p in self.placements]}

    @staticmethod
    def from_dict(d: dict[str, Any]) -> Solution:
        return Solution(puzzle_id=d["puzzleId"], placements=tuple(Placement.from_dict(p) for p in d["placements"]))
