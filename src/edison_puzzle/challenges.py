"""Challenge definitions and evaluation.

A challenge is a built-in puzzle plus measurable constraints taken from the
puzzle's own rules (actions, undo, time). Evaluation is pure: it takes the
attempt's statistics and whether the arrangement validated.

Time and action counts are reported by the client (there are no accounts or
anti-cheat); the arrangement itself is always validated server-side.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

EASY, MEDIUM, HARD, EXPERT = "easy", "medium", "hard", "expert"
DIFFICULTIES = (EASY, MEDIUM, HARD, EXPERT)


@dataclass(frozen=True)
class Challenge:
    id: str
    title: str
    difficulty: str
    puzzle_id: str
    objective: str
    description: str
    max_actions: int | None = None
    max_seconds: int | None = None
    max_undos: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "difficulty": self.difficulty,
            "puzzleId": self.puzzle_id,
            "objective": self.objective,
            "description": self.description,
            "constraints": {
                "maxActions": self.max_actions,
                "maxSeconds": self.max_seconds,
                "maxUndos": self.max_undos,
            },
        }


CHALLENGES: tuple[Challenge, ...] = (
    Challenge(
        "first-fit",
        "First Fit",
        EASY,
        "warmup-8",
        "Tile the 8 × 8 board with all 4 pieces.",
        "A small board to learn the controls: place, rotate, move, remove.",
    ),
    Challenge(
        "steady-hands",
        "Steady Hands",
        EASY,
        "warmup-16",
        "Tile the 16 × 16 board without using undo.",
        "Six pieces. Plan the layout from the largest piece down; every undo counts against you.",
        max_undos=0,
    ),
    Challenge(
        "economy-of-motion",
        "Economy of Motion",
        MEDIUM,
        "warmup-16",
        "Tile the 16 × 16 board in at most 8 board actions.",
        "A board action is placing, moving, rotating in place, or removing a piece. "
        "Six pieces need at least six; rotate pieces before you place them (that is free).",
        max_actions=8,
    ),
    Challenge(
        "fixed-orientation",
        "Fixed Orientation",
        MEDIUM,
        "warmup-24-fixed",
        "Tile the 24 × 24 board when pieces cannot be rotated.",
        "Eight pieces, rotation disabled: each piece must go in as the dimensions are written.",
        max_seconds=600,
    ),
    Challenge(
        "edison",
        "The Edison Puzzle",
        HARD,
        "edison-original",
        "Tile the 56 × 56 board with all 12 pieces.",
        "The original puzzle. Every piece is used once; rotation is allowed. "
        "The puzzle has one solution up to rotation and reflection.",
    ),
    Challenge(
        "edison-quarter-hour",
        "Edison in Fifteen Minutes",
        HARD,
        "edison-original",
        "Solve the original puzzle in 15 minutes or less.",
        "Same puzzle, with a clock.",
        max_seconds=900,
    ),
    Challenge(
        "edison-no-take-backs",
        "Edison, No Take-Backs",
        EXPERT,
        "edison-original",
        "Solve the original puzzle with no undo and at most 24 board actions.",
        "Twelve pieces need at least twelve actions. You may waste at most twelve.",
        max_actions=24,
        max_undos=0,
    ),
)

_BY_ID = {c.id: c for c in CHALLENGES}


def get_challenge(challenge_id: str) -> Challenge:
    return _BY_ID[challenge_id]


@dataclass(frozen=True)
class Check:
    id: str
    label: str
    passed: bool
    actual: float | None
    limit: float | None

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "label": self.label, "passed": self.passed, "actual": self.actual, "limit": self.limit}


@dataclass(frozen=True)
class ChallengeResult:
    challenge_id: str
    solved: bool
    passed: bool
    checks: tuple[Check, ...]
    feedback: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "challengeId": self.challenge_id,
            "solved": self.solved,
            "passed": self.passed,
            "checks": [c.to_dict() for c in self.checks],
            "feedback": self.feedback,
        }


def evaluate(challenge: Challenge, *, solved: bool, time_ms: int, actions: int, undos: int) -> ChallengeResult:
    """Pure evaluation. `solved` means the arrangement validated as a complete tiling."""
    checks = [Check("solved", "Board completely tiled", solved, None, None)]
    if challenge.max_actions is not None:
        checks.append(
            Check(
                "actions",
                f"At most {challenge.max_actions} board actions",
                actions <= challenge.max_actions,
                actions,
                challenge.max_actions,
            )
        )
    if challenge.max_undos is not None:
        label = "No undo used" if challenge.max_undos == 0 else f"At most {challenge.max_undos} undos"
        checks.append(Check("undos", label, undos <= challenge.max_undos, undos, challenge.max_undos))
    if challenge.max_seconds is not None:
        secs = time_ms / 1000
        checks.append(
            Check(
                "time",
                f"Within {challenge.max_seconds} seconds",
                secs <= challenge.max_seconds,
                round(secs, 1),
                challenge.max_seconds,
            )
        )
    passed = all(c.passed for c in checks)
    if passed:
        feedback = "Challenge complete."
    elif not solved:
        feedback = "The arrangement is not a complete valid tiling yet."
    else:
        failed = [c.label for c in checks if not c.passed]
        feedback = "Solved, but the constraints were not met: " + "; ".join(failed) + "."
    return ChallengeResult(challenge.id, solved, passed, tuple(checks), feedback)
