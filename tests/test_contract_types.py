"""The TypeScript contract (shared/types/*.ts) must describe exactly what the Python side emits.

Parses the simple `interface X { key: type; ... }` declarations and compares their key sets with real
engine / API output, so renaming a field on either side fails here instead of in the browser.
"""

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from conftest import make_puzzle
from edison_api import create_app
from edison_api.config import Settings
from edison_puzzle import Placement, Solver, SolverOptions, validate_solution
from edison_puzzle.challenges import evaluate, get_challenge

TYPES = Path(__file__).resolve().parent.parent / "shared" / "types"
SRC = (TYPES / "edison.ts").read_text() + (TYPES / "api.ts").read_text()


def keys(name: str) -> set[str]:
    m = re.search(rf"interface {name}(?:\s+extends\s+([\w, ]+))?\s*\{{(.*?)\n\}}", SRC, re.S)
    assert m, f"interface {name} not found"
    out: set[str] = set()
    for parent in (m.group(1) or "").split(","):
        if parent.strip():
            out |= keys(parent.strip())
    for line in m.group(2).splitlines():
        k = re.match(r"^  (\w+)\??:", line)
        if k:
            out.add(k.group(1))
    return out


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    return TestClient(create_app(Settings(db_path=tmp_path_factory.mktemp("db") / "c.sqlite3", frontend_dist=None)))


EVENT_IFACES = {
    "solver_started": "SolverStartedEvent",
    "piece_selected": "PieceSelectedEvent",
    "placement_attempted": "PlacementAttemptedEvent",
    "placement_accepted": "PlacementAcceptedEvent",
    "placement_rejected": "PlacementRejectedEvent",
    "backtrack_started": "BacktrackStartedEvent",
    "backtrack_completed": "BacktrackCompletedEvent",
    "solution_found": "SolutionFoundEvent",
    "search_completed": "SearchCompletedEvent",
}


def sample_events():
    puz = make_puzzle(4, 4, [(2, 2), (2, 2)] + [(1, 2)] * 4)
    by = {}
    for e in Solver(puz, SolverOptions(trace=True, max_solutions=None)).run():
        by.setdefault(e.type, e)
    return puz, by


def test_every_event_type_matches_its_typescript_interface():
    _, by = sample_events()
    assert set(by) == set(EVENT_IFACES)
    for t, iface in EVENT_IFACES.items():
        assert set(by[t].to_dict()) == keys(iface), t


def test_compact_events_omit_exactly_the_snapshot_fields():
    _, by = sample_events()
    for t, iface in EVENT_IFACES.items():
        compact = set(by[t].to_dict(compact=True))
        assert compact == keys(iface) - ({"placements", "remaining"} & keys(iface)), t


def test_domain_types():
    puz, by = sample_events()
    d = puz.to_dict()
    assert set(d) == keys("Puzzle") and set(d["board"]) == keys("Board") and set(d["pieces"][0]) == keys("Rectangle")
    assert set(by["placement_accepted"].placement.to_dict()) == keys("Placement")
    assert set(by["solution_found"].solution.to_dict()) == keys("Solution")
    assert set(by["search_completed"].metrics.to_dict()) == keys("SolverMetrics")
    bad = validate_solution(puz, []).to_dict()
    assert set(bad) == keys("ValidationResult") and set(bad["errors"][0]) - {"pieceId"} <= keys("ValidationError")
    assert set(evaluate(get_challenge("steady-hands"), solved=True, time_ms=1, actions=6, undos=0).to_dict()) == keys(
        "ChallengeResult"
    )


def test_api_responses_match_typescript(client):
    assert set(client.get("/api/limits").json()) == keys("Limits")
    assert set(client.get("/api/puzzles").json()["puzzles"][0]) == keys("PuzzleSummary")
    assert set(client.get("/api/puzzles/edison-original").json()) == keys("PuzzleDetail")
    assert set(client.get("/api/challenges").json()["challenges"][0]) == keys("Challenge")
    sol = client.get("/api/puzzles/edison-original/solutions").json()
    assert set(sol) == keys("SolutionsResponse")
    assert set(sol["solutions"][0]) == keys("GallerySolution")
    assert set(sol["families"][0]) == keys("SolutionFamily")
    solve = client.post("/api/puzzles/warmup-8/solve", json={}).json()
    assert set(solve) == keys("SolveResponse") - {"events", "eventsTruncated", "eventsCompact"}
    full = client.post("/api/puzzles/warmup-8/solve", json={"events": "full"}).json()
    assert set(full) == keys("SolveResponse")
    analysis = client.post(
        "/api/puzzles/analyze",
        json={"name": "x", "board": {"width": 2, "height": 2}, "pieces": [{"width": 1, "height": 1}]},
    ).json()
    assert set(analysis) == keys("PuzzleAnalysis") and set(analysis["issues"][0]) - {"pieceId"} <= keys("PuzzleIssue")
    pl = solve["solutions"][0]["placements"]
    att = client.post(
        "/api/attempts",
        json={
            "clientId": "client-abcdef12",
            "puzzleId": "warmup-8",
            "placements": pl,
            "timeMs": 1,
            "actions": 4,
            "undos": 0,
        },
    ).json()
    assert set(att) == keys("AttemptResponse")
    assert set(client.get("/api/progress?clientId=client-abcdef12").json()) == keys("ProgressResponse")
    err = client.get("/api/puzzles/nope").json()
    assert set(err) == {"error"} and set(err["error"]) == {"code", "message", "details"}  # nested shape of ApiErrorBody


def test_stream_done_frame_matches_typescript(client):
    with client.stream("GET", "/api/puzzles/warmup-8/solve/stream") as r:
        text = "".join(r.iter_text())
    import json

    done = json.loads(text.split("event: done\ndata: ")[1].split("\n")[0])
    assert set(done) == keys("StreamDone")


def test_status_unions_cover_every_status_the_engine_can_emit():
    from edison_puzzle import events as ev

    statuses = {getattr(ev, n) for n in dir(ev) if n.startswith("STATUS_")}
    ts = re.search(r"export type SearchStatus =(.*?);", SRC, re.S).group(1)
    assert statuses == set(re.findall(r'"(\w+)"', ts))


def test_placement_roundtrip_for_posted_bodies():
    p = Placement("a", 1, 2, 3, 4, True)
    assert set(p.to_dict()) == keys("Placement")
