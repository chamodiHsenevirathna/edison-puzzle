"""Runtime configuration and server-enforced limits.

Every client-supplied limit is *clamped* to these hard caps; clients cannot
raise them.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    db_path: Path
    frontend_dist: Path | None
    # Solver limits
    default_max_nodes: int = 2_000_000
    hard_max_nodes: int = 5_000_000
    default_time_limit_s: float = 10.0
    hard_time_limit_s: float = 30.0
    default_max_events: int = 50_000
    hard_max_events: int = 200_000
    max_concurrent_solves: int = 2
    stream_batch_size: int = 500
    # Data limits
    max_custom_puzzles: int = 200
    max_placements: int = 64

    @staticmethod
    def from_env() -> Settings:
        root = Path(__file__).resolve().parents[2]
        dist = Path(os.environ.get("EDISON_FRONTEND_DIST", root / "frontend" / "dist"))
        return Settings(
            db_path=Path(os.environ.get("EDISON_DB", root / "var" / "edison.sqlite3")),
            frontend_dist=dist if (dist / "index.html").is_file() else None,
        )
