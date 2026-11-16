"""Board state with placement validation, undo, copy and restore.

Occupancy is stored as one integer bitmask per row (bit `x` set = column `x`
occupied) which makes overlap checks O(piece height) instead of O(piece area).
The authoritative record of *what* is placed is the ordered `placements` list,
so any grid view can be derived from it.
"""

from __future__ import annotations

from collections.abc import Iterable

from .models import Placement

# Rejection reasons (stable strings; also used by solver events and the API).
OUT_OF_BOUNDS = "out_of_bounds"
OVERLAP = "overlap"
INVALID_SIZE = "invalid_size"


class PlacementError(ValueError):
    """Raised by Board.place() when a placement is not allowed."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


class Board:
    def __init__(self, width: int, height: int) -> None:
        if width <= 0 or height <= 0:
            raise ValueError("board dimensions must be positive")
        self.width = width
        self.height = height
        self._rows: list[int] = [0] * height
        self._full_row = (1 << width) - 1
        self._placements: dict[str, Placement] = {}
        self._occupied_cells = 0

    # ------------------------------------------------------------------ queries
    @property
    def area(self) -> int:
        return self.width * self.height

    @property
    def free_area(self) -> int:
        return self.area - self._occupied_cells

    @property
    def is_full(self) -> bool:
        return self._occupied_cells == self.area

    @property
    def placements(self) -> tuple[Placement, ...]:
        """Placements in insertion order."""
        return tuple(self._placements.values())

    def has_piece(self, piece_id: str) -> bool:
        return piece_id in self._placements

    def is_occupied(self, x: int, y: int) -> bool:
        if not (0 <= x < self.width and 0 <= y < self.height):
            raise IndexError((x, y))
        return bool(self._rows[y] >> x & 1)

    def first_free(self) -> tuple[int, int] | None:
        """Top-most, then left-most free cell as (x, y); None if the board is full."""
        full = self._full_row
        for y, row in enumerate(self._rows):
            if row != full:
                inverted = ~row & full
                return ((inverted & -inverted).bit_length() - 1, y)
        return None

    def free_run_width(self, x: int, y: int) -> int:
        """Number of consecutive free cells in row `y` starting at column `x`."""
        n = 0
        row = self._rows[y]
        while x + n < self.width and not (row >> (x + n)) & 1:
            n += 1
        return n

    def check(self, x: int, y: int, width: int, height: int) -> str | None:
        """Return None if a width x height rectangle fits at (x, y), else the rejection reason."""
        if width <= 0 or height <= 0:
            return INVALID_SIZE
        if x < 0 or y < 0 or x + width > self.width or y + height > self.height:
            return OUT_OF_BOUNDS
        mask = ((1 << width) - 1) << x
        rows = self._rows
        for r in range(y, y + height):
            if rows[r] & mask:
                return OVERLAP
        return None

    # ---------------------------------------------------------------- mutation
    def place(self, placement: Placement) -> None:
        if placement.piece_id in self._placements:
            raise PlacementError("already_placed", f"piece {placement.piece_id!r} is already on the board")
        reason = self.check(placement.x, placement.y, placement.width, placement.height)
        if reason is not None:
            raise PlacementError(reason, f"cannot place {placement.piece_id!r}: {reason}")
        self._fill(placement)
        self._placements[placement.piece_id] = placement

    def remove(self, piece_id: str) -> Placement:
        placement = self._placements.pop(piece_id)  # KeyError if absent
        mask = ((1 << placement.width) - 1) << placement.x
        for r in range(placement.y, placement.bottom):
            self._rows[r] &= ~mask
        self._occupied_cells -= placement.width * placement.height
        return placement

    def _fill(self, p: Placement) -> None:
        mask = ((1 << p.width) - 1) << p.x
        for r in range(p.y, p.bottom):
            self._rows[r] |= mask
        self._occupied_cells += p.width * p.height

    # ----------------------------------------------------- copy / snapshot / restore
    def copy(self) -> Board:
        """Independent deep copy; mutating either board never affects the other."""
        other = Board(self.width, self.height)
        other._rows = list(self._rows)
        other._placements = dict(self._placements)  # Placement is frozen
        other._occupied_cells = self._occupied_cells
        return other

    def snapshot(self) -> tuple[Placement, ...]:
        """Immutable state token; pass to `restore` to return to this state."""
        return self.placements

    def restore(self, snapshot: Iterable[Placement]) -> None:
        """Reset the board to exactly the given placements.

        Validates as it goes; on failure the board is left unchanged.
        """
        staged = Board(self.width, self.height)
        for p in snapshot:
            staged.place(p)
        self._rows = staged._rows
        self._placements = staged._placements
        self._occupied_cells = staged._occupied_cells

    # ------------------------------------------------------------------- views
    def to_grid(self) -> list[list[str | None]]:
        """grid[y][x] = piece id occupying the cell, or None."""
        grid: list[list[str | None]] = [[None] * self.width for _ in range(self.height)]
        for p in self._placements.values():
            for y in range(p.y, p.bottom):
                for x in range(p.x, p.right):
                    grid[y][x] = p.piece_id
        return grid
