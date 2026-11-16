"""Analysis of user-supplied puzzle definitions.

Works on raw dictionaries (never trusts the client) and returns every problem
found, each with a severity and a plain-language explanation. The result tells
the caller whether the puzzle may be saved and whether it is *provably*
unsolvable; "unknown" means only the solver can say.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .models import PuzzleConfig, PuzzleConfigError, Rectangle

MAX_BOARD_SIDE = 100
MAX_PIECES = 30
MAX_NAME_LENGTH = 80
MAX_ID_LENGTH = 64  # matches the API's placement pieceId limit

_PROVEN_IMPOSSIBLE = frozenset({"area_too_large", "area_too_small", "piece_too_large"})

ERROR, WARNING, INFO = "error", "warning", "info"


@dataclass(frozen=True)
class Issue:
    severity: str
    code: str
    message: str
    piece_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"severity": self.severity, "code": self.code, "message": self.message}
        if self.piece_id is not None:
            d["pieceId"] = self.piece_id
        return d


@dataclass
class Analysis:
    issues: list[Issue] = field(default_factory=list)
    board_area: int | None = None
    pieces_area: int | None = None
    config: PuzzleConfig | None = None

    @property
    def can_save(self) -> bool:
        return self.config is not None and not any(i.severity == ERROR for i in self.issues)

    @property
    def solvability(self) -> str:
        """'impossible' when proven by a necessary condition, else 'unknown'."""
        return "impossible" if any(i.code in _PROVEN_IMPOSSIBLE for i in self.issues) else "unknown"

    def to_dict(self) -> dict[str, Any]:
        return {
            "canSave": self.can_save,
            "solvability": self.solvability,
            "boardArea": self.board_area,
            "piecesArea": self.pieces_area,
            "areaDifference": None
            if self.board_area is None or self.pieces_area is None
            else self.pieces_area - self.board_area,
            "issues": [i.to_dict() for i in self.issues],
        }


def _is_int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def analyze_puzzle_input(raw: Any) -> Analysis:
    """Analyse a puzzle definition in the API wire format (see `PuzzleConfig.to_dict`)."""
    a = Analysis()

    def add(sev: str, code: str, msg: str, pid: str | None = None) -> None:
        a.issues.append(Issue(sev, code, msg, pid))

    if not isinstance(raw, dict):
        add(ERROR, "malformed", "The puzzle definition must be an object.")
        return a

    name = raw.get("name", "")
    if not isinstance(name, str) or not name.strip():
        add(ERROR, "name_required", "Give the puzzle a name.")
    elif len(name) > MAX_NAME_LENGTH:
        add(ERROR, "name_too_long", f"The name may be at most {MAX_NAME_LENGTH} characters.")

    board = raw.get("board")
    bw: Any = board.get("width") if isinstance(board, dict) else None
    bh: Any = board.get("height") if isinstance(board, dict) else None
    board_ok = _is_int(bw) and _is_int(bh) and bw > 0 and bh > 0
    if not board_ok:
        add(ERROR, "invalid_board", "Board width and height must be whole numbers greater than zero.")
    elif bw > MAX_BOARD_SIDE or bh > MAX_BOARD_SIDE:
        add(ERROR, "board_too_large", f"Each board side may be at most {MAX_BOARD_SIDE} cells.")
        board_ok = False

    rotation = raw.get("allowRotation", True)
    if not isinstance(rotation, bool):
        add(ERROR, "invalid_rotation_flag", "allowRotation must be true or false.")
        rotation = True

    pieces_raw = raw.get("pieces")
    rects: list[Rectangle] = []
    pieces_ok = isinstance(pieces_raw, list)
    if not pieces_ok:
        add(ERROR, "invalid_pieces", "Pieces must be a list.")
    elif not pieces_raw:
        add(ERROR, "no_pieces", "Add at least one piece.")
        pieces_ok = False
    elif len(pieces_raw) > MAX_PIECES:
        add(ERROR, "too_many_pieces", f"At most {MAX_PIECES} pieces are supported (search cost grows steeply).")
        pieces_ok = False
    if pieces_ok and isinstance(pieces_raw, list):
        used_ids: set[str] = set()
        for i, p in enumerate(pieces_raw):
            pid = p.get("id") if isinstance(p, dict) and p.get("id") else f"r{i + 1:02d}"
            w: Any
            h: Any
            w, h = (p.get("width"), p.get("height")) if isinstance(p, dict) else (None, None)
            if not isinstance(pid, str):
                add(ERROR, "invalid_piece", f"Piece {i + 1}: id must be text.")
                pieces_ok = False
                continue
            if len(pid) > MAX_ID_LENGTH:
                add(ERROR, "invalid_piece", f"Piece {i + 1}: id may be at most {MAX_ID_LENGTH} characters.")
                pieces_ok = False
                continue
            if not (_is_int(w) and _is_int(h) and w > 0 and h > 0):
                add(
                    ERROR,
                    "invalid_piece",
                    f"Piece {i + 1}: width and height must be whole numbers greater than zero.",
                    pid,
                )
                pieces_ok = False
                continue
            if pid in used_ids:
                add(ERROR, "duplicate_id", f"Piece id {pid!r} is used more than once.", pid)
                pieces_ok = False
                continue
            assert isinstance(w, int) and isinstance(h, int)  # established by _is_int above
            used_ids.add(pid)
            rects.append(Rectangle(pid, w, h))

    if not (board_ok and pieces_ok and rects):
        return a
    assert isinstance(bw, int) and isinstance(bh, int)  # board_ok implies both are ints

    a.board_area = bw * bh
    a.pieces_area = sum(r.area for r in rects)

    # Necessary condition 1: total area.
    diff = a.pieces_area - a.board_area
    if diff > 0:
        add(
            ERROR,
            "area_too_large",
            f"The pieces cover {a.pieces_area:,} cells but the board has {a.board_area:,}: "
            f"{diff:,} cells too many, so they cannot all fit.",
        )
    elif diff < 0:
        add(
            ERROR,
            "area_too_small",
            f"The pieces cover {a.pieces_area:,} cells but the board has {a.board_area:,}: "
            f"{-diff:,} cells short, so the board can never be completely covered.",
        )

    # Necessary condition 2: each piece must fit the empty board in an allowed orientation.
    for r in rects:
        fits_as_is = r.width <= bw and r.height <= bh
        fits_rotated = r.height <= bw and r.width <= bh
        if not fits_as_is and not (rotation and fits_rotated):
            how = "in either orientation" if rotation else "(rotation is off)"
            add(
                ERROR,
                "piece_too_large",
                f"Piece {r.id} ({r.width} × {r.height}) does not fit on a {bw} × {bh} board {how}.",
                r.id,
            )
        elif rotation and not fits_as_is and fits_rotated:
            add(INFO, "needs_rotation", f"Piece {r.id} ({r.width} × {r.height}) only fits when rotated.", r.id)

    groups = len({r.shape_key if rotation else (r.width, r.height) for r in rects})
    if groups < len(rects):
        add(
            INFO,
            "identical_pieces",
            f"{len(rects)} pieces form {groups} distinct shapes; identical pieces are interchangeable.",
        )

    if not any(i.severity == ERROR for i in a.issues):
        try:
            a.config = PuzzleConfig(
                id="draft",
                name=str(name).strip(),
                board_width=bw,
                board_height=bh,
                pieces=tuple(rects),
                allow_rotation=rotation,
            )
        except PuzzleConfigError as e:  # defensive: the checks above should have caught it
            add(ERROR, "invalid_config", str(e))
    return a
