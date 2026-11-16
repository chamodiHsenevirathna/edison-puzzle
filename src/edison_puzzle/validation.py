"""Solution validation.

Deliberately independent of `Board` and the solver (it counts cell coverage
directly), so it can be used to cross-check solver output.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from .models import Placement, PuzzleConfig

UNKNOWN_PIECE = "unknown_piece"
DUPLICATE_PIECE = "duplicate_piece"
MISSING_PIECE = "missing_piece"
DIMENSION_MISMATCH = "dimension_mismatch"
ROTATION_NOT_ALLOWED = "rotation_not_allowed"
ROTATION_FLAG_MISMATCH = "rotation_flag_mismatch"
OUT_OF_BOUNDS = "out_of_bounds"
OVERLAP = "overlap"
UNCOVERED_CELLS = "uncovered_cells"


@dataclass(frozen=True)
class ValidationError:
    code: str
    message: str
    piece_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.piece_id is not None:
            d["pieceId"] = self.piece_id
        return d


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    errors: tuple[ValidationError, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {"valid": self.valid, "errors": [e.to_dict() for e in self.errors]}


def validate_solution(puzzle: PuzzleConfig, placements: Iterable[Placement]) -> ValidationResult:
    """Check that `placements` is a complete, exact tiling of the puzzle board.

    All problems found are reported (not just the first).
    """
    placements = list(placements)
    errors: list[ValidationError] = []

    def err(code: str, msg: str, pid: str | None = None) -> None:
        errors.append(ValidationError(code, msg, pid))

    defs = {p.id: p for p in puzzle.pieces}
    seen: set[str] = set()
    cover: dict[tuple[int, int], str] = {}
    overlapped: set[tuple[str, str]] = set()

    for pl in placements:
        rect = defs.get(pl.piece_id)
        if rect is None:
            err(UNKNOWN_PIECE, f"piece {pl.piece_id!r} is not part of this puzzle", pl.piece_id)
            continue
        if pl.piece_id in seen:
            err(DUPLICATE_PIECE, f"piece {pl.piece_id!r} is placed more than once", pl.piece_id)
            continue
        seen.add(pl.piece_id)

        # Dimensions must match the definition, optionally rotated.
        as_defined = (pl.width, pl.height) == (rect.width, rect.height)
        as_rotated = (pl.width, pl.height) == (rect.height, rect.width)
        if not (as_defined or as_rotated):
            err(
                DIMENSION_MISMATCH,
                f"piece {pl.piece_id!r} is {rect.width}x{rect.height} but placed as {pl.width}x{pl.height}",
                pl.piece_id,
            )
            continue
        if not rect.is_square:
            actually_rotated = not as_defined
            if actually_rotated and not puzzle.allow_rotation:
                err(ROTATION_NOT_ALLOWED, f"piece {pl.piece_id!r} is rotated but rotation is disabled", pl.piece_id)
            if pl.rotated != actually_rotated:
                err(
                    ROTATION_FLAG_MISMATCH,
                    f"piece {pl.piece_id!r}: rotated={pl.rotated} contradicts its placed dimensions",
                    pl.piece_id,
                )

        if pl.x < 0 or pl.y < 0 or pl.right > puzzle.board_width or pl.bottom > puzzle.board_height:
            err(
                OUT_OF_BOUNDS,
                f"piece {pl.piece_id!r} at ({pl.x},{pl.y}) size {pl.width}x{pl.height} leaves the "
                f"{puzzle.board_width}x{puzzle.board_height} board",
                pl.piece_id,
            )
            continue

        for y in range(pl.y, pl.bottom):
            for x in range(pl.x, pl.right):
                other = cover.get((x, y))
                if other is None:
                    cover[(x, y)] = pl.piece_id
                elif (pl.piece_id, other) not in overlapped:
                    overlapped.add((pl.piece_id, other))
                    err(OVERLAP, f"pieces {other!r} and {pl.piece_id!r} overlap at ({x},{y})", pl.piece_id)

    for rect in puzzle.pieces:
        if rect.id not in seen:
            err(MISSING_PIECE, f"piece {rect.id!r} is not placed", rect.id)

    uncovered = puzzle.board_area - len(cover)
    if uncovered:
        err(UNCOVERED_CELLS, f"{uncovered} board cell(s) are not covered")

    return ValidationResult(valid=not errors, errors=tuple(errors))
