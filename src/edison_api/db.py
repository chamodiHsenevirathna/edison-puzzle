"""SQLite persistence (stdlib only).

One short-lived connection per operation keeps this safe under FastAPI's
thread pool. Tables:

* puzzles   - built-in and custom puzzle definitions (config as JSON)
* solutions - solver-found solutions, de-duplicated by geometry
* attempts  - validated completions submitted by the web app, tagged with an
              anonymous client id (no accounts)
"""

from __future__ import annotations

import json
import secrets
import sqlite3
import time
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path
from typing import Any

from edison_puzzle import Placement, PuzzleConfig, Solution
from edison_puzzle.symmetry import geometry

SCHEMA = """
CREATE TABLE IF NOT EXISTS puzzles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  built_in INTEGER NOT NULL DEFAULT 0,
  exhaustive INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS solutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  geometry_key TEXT NOT NULL,
  placements_json TEXT NOT NULL,
  created_at REAL NOT NULL,
  UNIQUE (puzzle_id, geometry_key)
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  puzzle_id TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  challenge_id TEXT,
  passed INTEGER,
  time_ms INTEGER NOT NULL,
  actions INTEGER NOT NULL,
  undos INTEGER NOT NULL,
  placements_json TEXT NOT NULL,
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_client ON attempts (client_id, puzzle_id);
"""


class Store:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        with closing(sqlite3.connect(self.path, timeout=10)) as c:
            c.row_factory = sqlite3.Row
            c.execute("PRAGMA foreign_keys = ON")
            c.execute("PRAGMA journal_mode = WAL")
            with c:  # commit / rollback
                yield c

    # ---------------------------------------------------------------- puzzles
    def upsert_builtin(self, puzzle: PuzzleConfig, order: int = 0) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT INTO puzzles (id, name, config_json, built_in, created_at) VALUES (?,?,?,1,?) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, config_json=excluded.config_json, "
                "built_in=1, created_at=excluded.created_at",
                (puzzle.id, puzzle.name, json.dumps(puzzle.to_dict()), float(order)),
            )

    def add_custom_puzzle(self, puzzle: PuzzleConfig) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT INTO puzzles (id, name, config_json, built_in, created_at) VALUES (?,?,?,0,?)",
                (puzzle.id, puzzle.name, json.dumps(puzzle.to_dict()), time.time()),
            )

    def new_puzzle_id(self) -> str:
        return "c-" + secrets.token_hex(4)

    def count_custom(self) -> int:
        with self._conn() as c:
            return int(c.execute("SELECT COUNT(*) FROM puzzles WHERE built_in=0").fetchone()[0])

    def list_puzzles(self) -> list[tuple[PuzzleConfig, bool]]:
        with self._conn() as c:
            rows = c.execute("SELECT * FROM puzzles ORDER BY built_in DESC, created_at, id").fetchall()
        return [(PuzzleConfig.from_dict(json.loads(r["config_json"])), bool(r["built_in"])) for r in rows]

    def get_puzzle(self, puzzle_id: str) -> tuple[PuzzleConfig, bool] | None:
        with self._conn() as c:
            r = c.execute("SELECT * FROM puzzles WHERE id=?", (puzzle_id,)).fetchone()
        if r is None:
            return None
        return PuzzleConfig.from_dict(json.loads(r["config_json"])), bool(r["built_in"])

    def delete_custom_puzzle(self, puzzle_id: str) -> bool:
        with self._conn() as c:
            return c.execute("DELETE FROM puzzles WHERE id=? AND built_in=0", (puzzle_id,)).rowcount > 0

    # -------------------------------------------------------------- solutions
    @staticmethod
    def _key(placements: tuple[Placement, ...]) -> str:
        return json.dumps(sorted(geometry(placements)))

    def save_solutions(self, puzzle_id: str, solutions: list[Solution], exhaustive: bool = False) -> int:
        added = 0
        with self._conn() as c:
            for s in solutions:
                cur = c.execute(
                    "INSERT OR IGNORE INTO solutions (puzzle_id, geometry_key, placements_json, created_at) "
                    "VALUES (?,?,?,?)",
                    (puzzle_id, self._key(s.placements), json.dumps([p.to_dict() for p in s.placements]), time.time()),
                )
                added += cur.rowcount
            if exhaustive:
                c.execute("UPDATE puzzles SET exhaustive=1 WHERE id=?", (puzzle_id,))
        return added

    def list_solutions(self, puzzle_id: str) -> tuple[list[Solution], bool]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT placements_json FROM solutions WHERE puzzle_id=? ORDER BY id", (puzzle_id,)
            ).fetchall()
            ex = c.execute("SELECT exhaustive FROM puzzles WHERE id=?", (puzzle_id,)).fetchone()
        sols = [Solution(puzzle_id, tuple(Placement.from_dict(p) for p in json.loads(r[0]))) for r in rows]
        return sols, bool(ex and ex[0])

    # --------------------------------------------------------------- attempts
    def add_attempt(
        self,
        *,
        client_id: str,
        puzzle_id: str,
        challenge_id: str | None,
        passed: bool | None,
        time_ms: int,
        actions: int,
        undos: int,
        placements: list[Placement],
    ) -> int:
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO attempts (client_id, puzzle_id, challenge_id, passed, time_ms, actions, undos, "
                "placements_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    client_id,
                    puzzle_id,
                    challenge_id,
                    None if passed is None else int(passed),
                    time_ms,
                    actions,
                    undos,
                    json.dumps([p.to_dict() for p in placements]),
                    time.time(),
                ),
            )
            return int(cur.lastrowid or 0)

    def list_attempts(self, client_id: str, puzzle_id: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        q = "SELECT * FROM attempts WHERE client_id=?"
        args: list[Any] = [client_id]
        if puzzle_id:
            q += " AND puzzle_id=?"
            args.append(puzzle_id)
        q += " ORDER BY id DESC LIMIT ?"
        args.append(limit)
        with self._conn() as c:
            rows = c.execute(q, args).fetchall()
        return [self._attempt_dict(r) for r in rows]

    def get_attempt(self, client_id: str, attempt_id: int) -> dict[str, Any] | None:
        with self._conn() as c:
            r = c.execute("SELECT * FROM attempts WHERE id=? AND client_id=?", (attempt_id, client_id)).fetchone()
        return self._attempt_dict(r) if r else None

    @staticmethod
    def _attempt_dict(r: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": r["id"],
            "puzzleId": r["puzzle_id"],
            "challengeId": r["challenge_id"],
            "passed": None if r["passed"] is None else bool(r["passed"]),
            "timeMs": r["time_ms"],
            "actions": r["actions"],
            "undos": r["undos"],
            "placements": json.loads(r["placements_json"]),
            "createdAt": r["created_at"],
        }

    def progress(self, client_id: str) -> dict[str, Any]:
        """Best result per puzzle and per challenge for one client."""
        with self._conn() as c:
            puzzles = c.execute(
                "SELECT puzzle_id, COUNT(*) n, MIN(time_ms) best_time, MIN(actions) best_actions "
                "FROM attempts WHERE client_id=? GROUP BY puzzle_id",
                (client_id,),
            ).fetchall()
            chal = c.execute(
                "SELECT challenge_id, COUNT(*) n, MAX(COALESCE(passed,0)) passed, "
                "MIN(CASE WHEN passed=1 THEN time_ms END) best_time, "
                "MIN(CASE WHEN passed=1 THEN actions END) best_actions "
                "FROM attempts WHERE client_id=? AND challenge_id IS NOT NULL GROUP BY challenge_id",
                (client_id,),
            ).fetchall()
        return {
            "puzzles": {
                r["puzzle_id"]: {"completions": r["n"], "bestTimeMs": r["best_time"], "bestActions": r["best_actions"]}
                for r in puzzles
            },
            "challenges": {
                r["challenge_id"]: {
                    "attempts": r["n"],
                    "passed": bool(r["passed"]),
                    "bestTimeMs": r["best_time"],
                    "bestActions": r["best_actions"],
                }
                for r in chal
            },
        }
