import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from edison_api import create_app
from edison_api.config import Settings
from edison_puzzle import Placement, original_puzzle, validate_solution

CID = "client-abcdef12"


def make_client(tmp_path: Path, **overrides) -> TestClient:
    s = Settings(db_path=tmp_path / "t.sqlite3", frontend_dist=None, **overrides)
    return TestClient(create_app(s))


@pytest.fixture
def client(tmp_path):
    return make_client(tmp_path)


DOMINOES = {
    "name": "Dominoes",
    "board": {"width": 2, "height": 2},
    "pieces": [{"width": 1, "height": 2}, {"width": 1, "height": 2}],
}


def error_code(r):
    return r.json()["error"]["code"]


# ------------------------------------------------------------------ puzzles
def test_health_and_limits(client):
    assert client.get("/api/health").json()["status"] == "ok"
    lim = client.get("/api/limits").json()
    assert lim["maxPieces"] == 30 and lim["solver"]["hardMaxNodes"] >= lim["solver"]["defaultMaxNodes"]


def test_builtin_puzzles_listed_original_first(client):
    ps = client.get("/api/puzzles").json()["puzzles"]
    assert ps[0]["id"] == "edison-original" and ps[0]["builtIn"] is True
    assert {p["id"] for p in ps} >= {"edison-original", "warmup-8", "warmup-16", "warmup-24-fixed"}


def test_original_puzzle_detail_matches_spec(client):
    d = client.get("/api/puzzles/edison-original").json()
    assert d["board"] == {"width": 56, "height": 56}
    assert sorted((p["width"], p["height"]) for p in d["pieces"]) == sorted(
        [
            (28, 14),
            (21, 18),
            (21, 18),
            (21, 14),
            (21, 14),
            (32, 11),
            (32, 10),
            (28, 7),
            (28, 6),
            (17, 14),
            (14, 4),
            (10, 7),
        ]
    )
    assert (d["piecesArea"], d["boardArea"], d["areaBalanced"]) == (3136, 3136, True)


def test_unknown_puzzle_is_404_with_envelope(client):
    r = client.get("/api/puzzles/nope")
    assert r.status_code == 404 and error_code(r) == "puzzle_not_found"
    assert set(r.json()["error"]) == {"code", "message", "details"}


def test_unknown_route_uses_envelope(client):
    r = client.get("/api/nothing-here")
    assert r.status_code == 404 and error_code(r) == "not_found"


def test_create_get_delete_custom_puzzle(client):
    r = client.post("/api/puzzles", json=DOMINOES)
    assert r.status_code == 201
    p = r.json()
    assert p["builtIn"] is False and p["id"].startswith("c-") and p["areaBalanced"]
    assert [x["id"] for x in p["pieces"]] == ["r01", "r02"]
    assert client.get(f"/api/puzzles/{p['id']}").json()["name"] == "Dominoes"
    assert client.delete(f"/api/puzzles/{p['id']}").status_code == 204
    assert client.get(f"/api/puzzles/{p['id']}").status_code == 404


def test_cannot_delete_builtin(client):
    r = client.delete("/api/puzzles/edison-original")
    assert r.status_code == 403 and error_code(r) == "built_in_puzzle"
    assert client.get("/api/puzzles/edison-original").status_code == 200


@pytest.mark.parametrize(
    "body,expect",
    [
        ({**DOMINOES, "pieces": [{"width": 1, "height": 2}]}, "area_too_small"),
        ({**DOMINOES, "board": {"width": 0, "height": 2}}, "invalid_board"),
        ({**DOMINOES, "name": ""}, "name_required"),
        ({**DOMINOES, "pieces": [{"width": 9, "height": 9}, {"width": 1, "height": 1}]}, "piece_too_large"),
        ({**DOMINOES, "board": {"width": 101, "height": 2}}, "board_too_large"),
    ],
)
def test_invalid_puzzles_rejected_with_explanations(client, body, expect):
    r = client.post("/api/puzzles", json=body)
    assert r.status_code == 422 and error_code(r) == "invalid_puzzle"
    assert expect in [d["code"] for d in r.json()["error"]["details"]]
    assert client.get("/api/puzzles").json()["puzzles"][-1]["builtIn"] is True  # nothing stored


def test_analyze_endpoint_is_stateless(client):
    before = len(client.get("/api/puzzles").json()["puzzles"])
    a = client.post("/api/puzzles/analyze", json={**DOMINOES, "pieces": [{"width": 1, "height": 2}]}).json()
    assert a["canSave"] is False and a["areaDifference"] == -2
    assert len(client.get("/api/puzzles").json()["puzzles"]) == before


def test_custom_puzzle_limit(tmp_path):
    c = make_client(tmp_path, max_custom_puzzles=2)
    assert c.post("/api/puzzles", json=DOMINOES).status_code == 201
    assert c.post("/api/puzzles", json=DOMINOES).status_code == 201
    r = c.post("/api/puzzles", json=DOMINOES)
    assert r.status_code == 409 and error_code(r) == "limit_exceeded"


def test_non_object_body_is_422(client):
    assert client.post("/api/puzzles", json=[1]).status_code == 422


# ------------------------------------------------------------------ solving
def test_solve_original_returns_valid_solution(client):
    r = client.post("/api/puzzles/edison-original/solve", json={})
    d = r.json()
    assert r.status_code == 200 and d["status"] == "max_solutions" and len(d["solutions"]) == 1
    sol = [Placement.from_dict(p) for p in d["solutions"][0]["placements"]]
    assert validate_solution(original_puzzle(), sol).valid
    assert d["metrics"]["nodesVisited"] == 1102 and "events" not in d


def test_solve_unsolvable_is_200_with_status_not_error(client):
    pid = client.post(
        "/api/puzzles",
        json={
            "name": "t",
            "board": {"width": 3, "height": 3},
            "pieces": [{"width": 2, "height": 2}, {"width": 2, "height": 2}, {"width": 1, "height": 1}],
        },
    ).json()["id"]
    d = client.post(f"/api/puzzles/{pid}/solve", json={"maxSolutions": None}).json()
    assert d["status"] == "exhausted" and d["solutions"] == []


def test_solve_all_solutions_of_custom_puzzle_and_save(client):
    pid = client.post("/api/puzzles", json=DOMINOES).json()["id"]
    d = client.post(f"/api/puzzles/{pid}/solve", json={"maxSolutions": None, "save": True}).json()
    assert d["status"] == "exhausted" and len(d["solutions"]) == 2
    g = client.get(f"/api/puzzles/{pid}/solutions").json()
    assert g["count"] == 2 and g["exhaustive"] is True and g["familyCount"] == 1
    # saving again does not duplicate
    client.post(f"/api/puzzles/{pid}/solve", json={"maxSolutions": None, "save": True})
    assert client.get(f"/api/puzzles/{pid}/solutions").json()["count"] == 2


def test_solve_with_milestone_and_full_events(client):
    pid = client.post("/api/puzzles", json=DOMINOES).json()["id"]
    m = client.post(f"/api/puzzles/{pid}/solve", json={"events": "milestones"}).json()
    assert [e["type"] for e in m["events"]] == ["solver_started", "solution_found", "search_completed"]
    f = client.post(f"/api/puzzles/{pid}/solve", json={"events": "full"}).json()
    assert f["eventsCompact"] is True and "placements" not in f["events"][1]
    assert f["events"][1]["type"] == "piece_selected"


def test_event_limit_truncates_and_reports(client):
    d = client.post("/api/puzzles/edison-original/solve", json={"events": "full", "maxEvents": 100}).json()
    assert d["eventsTruncated"] is True and len(d["events"]) == 100 and d["status"] == "event_limit"


def test_client_limits_are_clamped_to_server_caps(tmp_path):
    c = make_client(tmp_path, hard_max_nodes=50, default_max_nodes=50)
    d = c.post("/api/puzzles/edison-original/solve", json={"maxNodes": 10**9}).json()
    assert d["status"] == "node_limit" and d["metrics"]["nodesVisited"] == 50


def test_node_limit_request(client):
    d = client.post("/api/puzzles/edison-original/solve", json={"maxNodes": 10}).json()
    assert d["status"] == "node_limit" and d["solutions"] == []


@pytest.mark.parametrize(
    "body",
    [
        {"maxSolutions": 0},
        {"maxNodes": 0},
        {"timeLimitSeconds": -1},
        {"events": "everything"},
        {"bogus": 1},
        {"maxSolutions": "x"},
    ],
)
def test_invalid_solve_requests(client, body):
    r = client.post("/api/puzzles/edison-original/solve", json=body)
    assert r.status_code == 422 and error_code(r) == "invalid_request" and r.json()["error"]["details"]


def test_solve_unknown_puzzle(client):
    assert client.post("/api/puzzles/zzz/solve", json={}).status_code == 404


def test_solver_busy_returns_429(client):
    slots = client.app.state.slots
    while slots.try_acquire():
        pass
    r = client.post("/api/puzzles/edison-original/solve", json={})
    assert r.status_code == 429 and error_code(r) == "solver_busy"
    assert client.get("/api/puzzles/edison-original/solve/stream").status_code == 429
    for _ in range(5):
        slots.release()
    assert client.post("/api/puzzles/edison-original/solve", json={}).status_code == 200


# ------------------------------------------------------------------- stream
def parse_sse(text):
    frames = []
    for block in text.split("\n\n"):
        if not block.strip() or block.startswith(":"):
            continue
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        frames.append((lines["event"], json.loads(lines["data"])))
    return frames


def stream_all(client, url):
    with client.stream("GET", url) as r:
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
        return parse_sse("".join(r.iter_text()))


def test_stream_delivers_the_real_solver_events_for_the_original(client):
    frames = stream_all(client, "/api/puzzles/edison-original/solve/stream")
    kinds = [k for k, _ in frames]
    assert kinds[-1] == "done" and set(kinds[:-1]) == {"events"}
    events = [e for k, batch in frames if k == "events" for e in batch]
    done = frames[-1][1]
    assert len(events) == 23_291 and done["eventsSent"] == 23_291 and done["truncated"] is False
    assert [e["seq"] for e in events] == list(range(len(events)))
    assert events[0]["type"] == "solver_started" and events[-1]["type"] == "search_completed"
    assert done["status"] == "max_solutions" and done["metrics"]["nodesVisited"] == 1102
    assert all("placements" not in e for e in events)
    # replaying the compact stream reaches a valid complete tiling at solution_found
    final = [e for e in events if e["type"] == "solution_found"][0]["solution"]["placements"]
    assert validate_solution(original_puzzle(), [Placement.from_dict(p) for p in final]).valid
    # and the metrics agree with the events
    counts = {
        t: sum(e["type"] == t for e in events)
        for t in ("placement_attempted", "placement_accepted", "placement_rejected", "backtrack_completed")
    }
    m = done["metrics"]
    assert (
        counts["placement_attempted"],
        counts["placement_accepted"],
        counts["placement_rejected"],
        counts["backtrack_completed"],
    ) == (m["placementsAttempted"], m["placementsAccepted"], m["placementsRejected"], m["backtracks"])


def test_stream_compact_replay_matches_non_compact_snapshots(client):
    pid = client.post(
        "/api/puzzles",
        json={
            "name": "t",
            "board": {"width": 4, "height": 4},
            "pieces": [{"width": 2, "height": 2}] * 2 + [{"width": 1, "height": 2}] * 4,
        },
    ).json()["id"]
    compact = [
        e
        for k, b in stream_all(client, f"/api/puzzles/{pid}/solve/stream?maxSolutions=all")
        if k == "events"
        for e in b
    ]
    full = [
        e
        for k, b in stream_all(client, f"/api/puzzles/{pid}/solve/stream?maxSolutions=all&compact=false")
        if k == "events"
        for e in b
    ]
    assert len(compact) == len(full)
    stack = []
    for c, f in zip(compact, full, strict=True):
        if c["type"] == "placement_accepted":
            stack.append(c["placement"])
        elif c["type"] == "backtrack_completed":
            stack.pop()
        if "placements" in f:
            assert f["placements"] == stack


def test_stream_event_limit_marks_truncated(client):
    frames = stream_all(client, "/api/puzzles/edison-original/solve/stream?maxEvents=1000")
    done = frames[-1][1]
    assert done["truncated"] is True and done["status"] == "event_limit" and done["eventsSent"] == 1000


def test_stream_without_trace_only_milestones(client):
    frames = stream_all(client, "/api/puzzles/edison-original/solve/stream?trace=false")
    types = [e["type"] for k, b in frames if k == "events" for e in b]
    assert types == ["solver_started", "solution_found", "search_completed"]


def test_stream_node_limit_status(client):
    frames = stream_all(client, "/api/puzzles/edison-original/solve/stream?maxNodes=5")
    assert frames[-1][1]["status"] == "node_limit"


@pytest.mark.parametrize("qs", ["maxSolutions=0", "maxSolutions=abc", "maxNodes=0", "timeLimitSeconds=-2"])
def test_stream_rejects_bad_parameters(client, qs):
    assert client.get(f"/api/puzzles/edison-original/solve/stream?{qs}").status_code == 422


def test_closing_the_stream_early_cancels_the_search_and_frees_the_slot(client):
    slots = client.app.state.slots
    url = "/api/puzzles/edison-original/solve/stream?maxSolutions=all&timeLimitSeconds=30&maxEvents=200000"
    with client.stream("GET", url) as r:
        it = r.iter_text()
        next(it)  # first batch arrived; the search is still running
        assert slots._used == 1, "stream should be holding a solver slot while running"
    deadline = time.time() + 5
    while time.time() < deadline and not (slots._used == 0):
        time.sleep(0.05)
    assert slots._used == 0, "slot leaked after client disconnect"


# ------------------------------------------------------------------ validate
def test_validate_endpoint(client):
    pid = client.post("/api/puzzles", json=DOMINOES).json()["id"]
    good = [
        {"pieceId": "r01", "x": 0, "y": 0, "width": 1, "height": 2, "rotated": False},
        {"pieceId": "r02", "x": 1, "y": 0, "width": 1, "height": 2, "rotated": False},
    ]
    assert client.post(f"/api/puzzles/{pid}/validate", json={"placements": good}).json() == {
        "valid": True,
        "errors": [],
    }
    bad = [good[0], {**good[1], "x": 0}]
    d = client.post(f"/api/puzzles/{pid}/validate", json={"placements": bad}).json()
    assert d["valid"] is False and {e["code"] for e in d["errors"]} == {"overlap", "uncovered_cells"}


@pytest.mark.parametrize(
    "pl",
    [
        {"pieceId": "", "x": 0, "y": 0, "width": 1, "height": 1},
        {"pieceId": "a", "x": 0, "y": 0, "width": 0, "height": 1},
        {"pieceId": "a", "x": "z", "y": 0, "width": 1, "height": 1},
        {"pieceId": "a", "x": 0, "y": 0, "width": 10**6, "height": 1},
    ],
)
def test_validate_rejects_malformed_placements(client, pl):
    assert client.post("/api/puzzles/edison-original/validate", json={"placements": [pl]}).status_code == 422


def test_validate_huge_but_in_schema_placement_is_cheap(client):
    pl = {"pieceId": "r01", "x": 0, "y": 0, "width": 1000, "height": 1000}
    t = time.time()
    d = client.post("/api/puzzles/edison-original/validate", json={"placements": [pl]}).json()
    assert not d["valid"] and time.time() - t < 1


# ----------------------------------------------------------------- solutions
def test_original_solutions_are_one_family_of_eight(client):
    d = client.get("/api/puzzles/edison-original/solutions").json()
    assert (d["count"], d["familyCount"], d["exhaustive"], d["boardSymmetries"]) == (8, 1, True, 8)
    assert d["solutions"][0]["canonical"] and d["solutions"][0]["transform"] == "identity"
    assert len({s["transform"] for s in d["solutions"]}) == 8
    puz = original_puzzle()
    for s in d["solutions"]:
        assert validate_solution(puz, [Placement.from_dict(p) for p in s["placements"]]).valid


def test_warmups_have_exhaustive_precomputed_solutions(client):
    for pid in ("warmup-8", "warmup-16", "warmup-24-fixed"):
        d = client.get(f"/api/puzzles/{pid}/solutions").json()
        assert d["exhaustive"] is True and d["count"] >= 1 and d["familyCount"] <= d["count"]


# ---------------------------------------------------------------- challenges
def test_challenge_list(client):
    cs = client.get("/api/challenges").json()["challenges"]
    assert len(cs) >= 6 and {"id", "title", "difficulty", "puzzleId", "objective", "constraints"} <= set(cs[0])


# ------------------------------------------------------------------ attempts
def a_solution(client, pid="warmup-8"):
    return client.post(f"/api/puzzles/{pid}/solve", json={}).json()["solutions"][0]["placements"]


def attempt(client, pid="warmup-8", **kw):
    body = {
        "clientId": CID,
        "puzzleId": pid,
        "placements": a_solution(client, pid),
        "timeMs": 5000,
        "actions": 4,
        "undos": 0,
    }
    body.update(kw)
    return client.post("/api/attempts", json=body)


def test_valid_attempt_is_stored_and_listed(client):
    r = attempt(client).json()
    assert r["valid"] and r["attemptId"] and r["minimumActions"] == 4
    lst = client.get(f"/api/attempts?clientId={CID}&puzzleId=warmup-8").json()["attempts"]
    assert len(lst) == 1 and lst[0]["timeMs"] == 5000 and lst[0]["id"] == r["attemptId"]
    assert client.get("/api/attempts?clientId=other-client-9").json()["attempts"] == []


def test_invalid_attempt_is_reported_not_stored(client):
    r = attempt(client, placements=[]).json()
    assert r["valid"] is False and r["attemptId"] is None
    assert {e["code"] for e in r["validation"]["errors"]} >= {"missing_piece", "uncovered_cells"}
    assert client.get(f"/api/attempts?clientId={CID}").json()["attempts"] == []


def test_implausible_action_count_rejected(client):
    r = attempt(client, actions=1)
    assert r.status_code == 422 and error_code(r) == "implausible_stats"


def test_challenge_attempt_evaluated_server_side(client):
    ok = attempt(client, "warmup-16", challengeId="steady-hands", actions=6, undos=0).json()
    assert ok["challenge"]["passed"] is True
    bad = attempt(client, "warmup-16", challengeId="steady-hands", actions=7, undos=2).json()
    assert bad["valid"] and bad["challenge"]["passed"] is False and "No undo" in bad["challenge"]["feedback"]


def test_challenge_for_wrong_puzzle_and_unknown_challenge(client):
    assert error_code(attempt(client, "warmup-8", challengeId="steady-hands")) == "challenge_mismatch"
    assert error_code(attempt(client, "warmup-8", challengeId="nope")) == "challenge_not_found"


@pytest.mark.parametrize(
    "patch",
    [
        {"clientId": "short"},
        {"clientId": "has spaces here!!"},
        {"timeMs": -1},
        {"actions": -1},
        {"undos": 10**9},
        {"extra": 1},
    ],
)
def test_attempt_validation(client, patch):
    assert attempt(client, **patch).status_code == 422


def test_progress_summary(client):
    attempt(client, "warmup-16", challengeId="steady-hands", actions=6, undos=0, timeMs=9000)
    attempt(client, "warmup-16", challengeId="steady-hands", actions=6, undos=0, timeMs=7000)
    attempt(client, "warmup-16", challengeId="economy-of-motion", actions=20, undos=0)  # solved, constraint failed
    p = client.get(f"/api/progress?clientId={CID}").json()
    assert p["challenges"]["steady-hands"] == {"attempts": 2, "passed": True, "bestTimeMs": 7000, "bestActions": 6}
    assert p["challenges"]["economy-of-motion"]["passed"] is False
    assert p["puzzles"]["warmup-16"]["completions"] == 3


# --------------------------------------------------------------- persistence
def test_data_survives_restart(tmp_path):
    c1 = make_client(tmp_path)
    pid = c1.post("/api/puzzles", json=DOMINOES).json()["id"]
    c1.post(f"/api/puzzles/{pid}/solve", json={"maxSolutions": None, "save": True})
    attempt(c1)
    c2 = make_client(tmp_path)  # new app, same database file
    assert c2.get(f"/api/puzzles/{pid}").status_code == 200
    assert c2.get(f"/api/puzzles/{pid}/solutions").json()["count"] == 2
    assert len(c2.get(f"/api/attempts?clientId={CID}").json()["attempts"]) == 1


def test_deleting_a_puzzle_removes_its_solutions_and_attempts(client):
    pid = client.post("/api/puzzles", json=DOMINOES).json()["id"]
    sol = client.post(f"/api/puzzles/{pid}/solve", json={"save": True}).json()["solutions"][0]["placements"]
    client.post(
        "/api/attempts",
        json={"clientId": CID, "puzzleId": pid, "placements": sol, "timeMs": 1, "actions": 2, "undos": 0},
    )
    client.delete(f"/api/puzzles/{pid}")
    assert client.get(f"/api/attempts?clientId={CID}&puzzleId={pid}").json()["attempts"] == []


def test_builtin_definitions_are_resynced_on_startup(tmp_path):
    c = make_client(tmp_path)
    import sqlite3

    con = sqlite3.connect(tmp_path / "t.sqlite3")
    con.execute("UPDATE puzzles SET name='tampered' WHERE id='warmup-8'")
    con.commit()
    con.close()
    c2 = make_client(tmp_path)
    assert c2.get("/api/puzzles/warmup-8").json()["name"] == "Warm-up 8 × 8"
    assert c.get("/api/health").status_code == 200


# ----------------------------------------------------------------------- SPA
def test_spa_fallback_and_path_traversal(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>app</html>")
    (dist / "assets" / "a.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("secret")
    c = TestClient(create_app(Settings(db_path=tmp_path / "s.sqlite3", frontend_dist=dist)))
    assert c.get("/play/edison-original").text == "<html>app</html>"
    assert c.get("/assets/a.js").text == "console.log(1)"
    assert "secret" not in c.get("/..%2fsecret.txt").text
    assert "secret" not in c.get("/../secret.txt").text
    r = c.get("/api/nope")
    assert r.status_code == 404 and error_code(r) == "not_found"
