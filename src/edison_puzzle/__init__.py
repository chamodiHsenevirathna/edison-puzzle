"""Edison Puzzle engine: board, solver, validation and execution events."""

from .board import Board, PlacementError
from .catalog import ORIGINAL_PUZZLE_ID, original_puzzle
from .events import SolverEvent, SolverMetrics
from .models import Placement, PuzzleConfig, PuzzleConfigError, Rectangle, Solution
from .solver import Solver, SolveResult, SolverOptions, solve
from .validation import ValidationResult, validate_solution

__all__ = [
    "Board",
    "PlacementError",
    "ORIGINAL_PUZZLE_ID",
    "original_puzzle",
    "SolverEvent",
    "SolverMetrics",
    "Placement",
    "PuzzleConfig",
    "PuzzleConfigError",
    "Rectangle",
    "Solution",
    "SolveResult",
    "Solver",
    "SolverOptions",
    "solve",
    "ValidationResult",
    "validate_solution",
]
