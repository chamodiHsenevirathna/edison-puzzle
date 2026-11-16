"""Packaged data: the exhaustively computed solutions of the original puzzle."""

from __future__ import annotations

import json
from importlib import resources

from .models import Solution


def load_original_solutions() -> tuple[list[Solution], int]:
    """Return (solutions, search_nodes) from `data/original_solutions.json`."""
    text = resources.files("edison_puzzle").joinpath("data/original_solutions.json").read_text()
    payload = json.loads(text)
    return [Solution.from_dict(s) for s in payload["solutions"]], int(payload["searchNodes"])
