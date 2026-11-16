import json

import pytest

from conftest import make_puzzle
from edison_puzzle import Placement, Solver, SolverOptions, original_puzzle, validate_solution
from edison_puzzle.events import ALL_EVENT_TYPES
from oracle import all_tilings


def run(puz, **kw):
    return list(Solver(puz, SolverOptions(**kw)).run())


def types(evs):
    return [e.type for e in evs]


@pytest.fixture
def small():
    return make_puzzle(4, 4, [(2, 2), (2, 2), (1, 2), (1, 2), (1, 2), (1, 2)])


# ---------------------------------------------------------------- framing
def test_stream_is_framed_by_started_and_completed_with_sequential_seq(small):
    evs = run(small, trace=True, max_solutions=None)
    assert evs[0].type == "solver_started" and evs[-1].type == "search_completed"
    assert [e.seq for e in evs] == list(range(len(evs)))
    assert types(evs).count("solver_started") == types(evs).count("search_completed") == 1


def test_trace_off_emits_only_milestones(small):
    evs = run(small, trace=False, max_solutions=None)
    assert set(types(evs)) <= {"solver_started", "solution_found", "search_completed"}
    assert types(evs).count("solution_found") == evs[-1].solutions_found > 0


def test_unsolvable_by_area_emits_started_then_completed_only():
    evs = run(make_puzzle(4, 4, [(2, 2)] * 3), trace=True)
    assert types(evs) == ["solver_started", "search_completed"]
    assert evs[-1].status == "not_solvable" and evs[-1].message


def test_started_event_carries_the_puzzle():
    puz = original_puzzle()
    ev = next(iter(Solver(puz, SolverOptions(trace=True)).run()))
    d = ev.to_dict()
    assert d["type"] == "solver_started"
    assert d["puzzle"]["board"] == {"width": 56, "height": 56}
    assert len(d["puzzle"]["pieces"]) == 12


# ----------------------------------------------------- per-step structure
def test_every_attempt_is_followed_by_exactly_one_accept_or_reject(small):
    evs = run(small, trace=True, max_solutions=None)
    for i, e in enumerate(evs):
        if e.type == "placement_attempted":
            nxt = evs[i + 1]
            assert nxt.type in ("placement_accepted", "placement_rejected")
            assert nxt.placement == e.placement


def test_every_piece_selected_is_followed_by_an_attempt_of_that_piece(small):
    evs = run(small, trace=True, max_solutions=None)
    for i, e in enumerate(evs):
        if e.type == "piece_selected":
            assert evs[i + 1].type == "placement_attempted"
            assert evs[i + 1].placement.piece_id == e.piece_id
            assert (evs[i + 1].placement.x, evs[i + 1].placement.y) == (e.x, e.y)


def test_every_accept_is_eventually_matched_by_backtrack_or_ends_search(small):
    # Exhaustive run: every accepted placement must be undone by a backtrack pair.
    evs = run(small, trace=True, max_solutions=None)
    assert evs[-1].status == "exhausted"
    stack = []
    for e in evs:
        if e.type == "placement_accepted":
            stack.append(e.placement)
        elif e.type == "backtrack_started":
            assert stack and stack[-1] == e.placement, "backtrack must undo the most recent placement"
        elif e.type == "backtrack_completed":
            assert stack.pop() == e.removed
    assert stack == []


def test_backtrack_started_always_precedes_its_completed(small):
    evs = run(small, trace=True, max_solutions=None)
    for i, e in enumerate(evs):
        if e.type == "backtrack_started":
            assert evs[i + 1].type == "backtrack_completed"
            assert evs[i + 1].removed == e.placement


def test_rejections_are_genuine_and_labelled_correctly(small):
    """Recompute from scratch (plain geometry) whether each rejected candidate really is invalid."""
    evs = run(small, trace=True, max_solutions=None)
    seen_reasons = set()
    for e in evs:
        if e.type != "placement_rejected":
            continue
        p = e.placement
        oob = p.x < 0 or p.y < 0 or p.right > 4 or p.bottom > 4
        cells = {(x, y) for q in e.placements for x in range(q.x, q.right) for y in range(q.y, q.bottom)}
        overlap = any((x, y) in cells for x in range(p.x, p.right) for y in range(p.y, p.bottom))
        assert oob or overlap, f"{p} was rejected but is valid"
        assert e.reason == ("out_of_bounds" if oob else "overlap")
        seen_reasons.add(e.reason)
    assert seen_reasons == {"out_of_bounds", "overlap"}


def test_accepted_placements_are_genuinely_valid(small):
    evs = run(small, trace=True, max_solutions=None)
    for e in evs:
        if e.type == "placement_accepted":
            p = e.placement
            assert 0 <= p.x and 0 <= p.y and p.right <= 4 and p.bottom <= 4
            prior = [q for q in e.placements if q != p]
            for q in prior:
                disjoint = p.right <= q.x or q.right <= p.x or p.bottom <= q.y or q.bottom <= p.y
                assert disjoint, f"{p} overlaps {q}"


# ------------------------------------------------------ state snapshots
def test_snapshots_match_a_replay_of_the_event_stream(small):
    """Rebuild the board only from accepted/backtrack events and compare to each event's own snapshot."""
    ids = [r.id for r in small.pieces]
    evs = run(small, trace=True, max_solutions=None)
    stack: list[Placement] = []
    for e in evs:
        if e.type == "placement_accepted":
            stack.append(e.placement)
        elif e.type == "backtrack_completed":
            stack.pop()
        if hasattr(e, "placements"):
            assert list(e.placements) == stack, f"seq {e.seq} ({e.type}) snapshot disagrees with replay"
            assert set(e.remaining) == set(ids) - {p.piece_id for p in stack}
            assert list(e.remaining) == [i for i in ids if i in e.remaining]  # config order


def test_depth_equals_number_of_placed_pieces_at_node_entry(small):
    evs = run(small, trace=True, max_solutions=None)
    for e in evs:
        if e.type in ("piece_selected", "placement_attempted", "placement_rejected"):
            assert e.depth == len(e.placements)
        elif e.type == "placement_accepted":
            assert e.depth == len(e.placements) - 1
        elif e.type == "backtrack_started":
            assert e.depth == len(e.placements) - 1
        elif e.type == "backtrack_completed":
            assert e.depth == len(e.placements)


def test_event_snapshots_are_not_aliased_to_live_solver_state(small):
    evs = run(small, trace=True, max_solutions=None)
    first_accept = next(e for e in evs if e.type == "placement_accepted")
    before = first_accept.placements
    run(small, trace=True)  # another run must not disturb earlier events
    assert first_accept.placements == before and len(before) == 1


# ------------------------------------------------------------- solutions
def test_solution_found_events_hold_valid_complete_solutions(small):
    evs = run(small, trace=True, max_solutions=None)
    sols = [e for e in evs if e.type == "solution_found"]
    assert [s.solution_index for s in sols] == list(range(len(sols)))
    assert len(sols) == len(all_tilings(4, 4, [(2, 2), (2, 2)] + [(1, 2)] * 4))  # independent oracle
    for s in sols:
        assert validate_solution(small, s.solution.placements).valid


def test_solution_event_precedes_final_completion_and_counts_agree(small):
    evs = run(small, max_solutions=3)
    assert types(evs)[-1] == "search_completed"
    assert evs[-1].status == "max_solutions" and evs[-1].solutions_found == 3


# --------------------------------------------------------------- metrics
def test_final_metrics_match_event_counts(small):
    evs = run(small, trace=True, max_solutions=None)
    m = evs[-1].metrics
    t = types(evs)
    assert m.placements_attempted == t.count("placement_attempted")
    assert m.placements_accepted == t.count("placement_accepted")
    assert m.placements_rejected == t.count("placement_rejected")
    assert m.backtracks == t.count("backtrack_completed")
    assert m.solutions_found == t.count("solution_found")
    assert m.placements_attempted == m.placements_accepted + m.placements_rejected
    assert m.max_depth == 6  # all six pieces get placed in a full solution
    assert m.nodes_visited == m.placements_accepted + 1  # root + one node per accepted placement
    assert m.elapsed_ms >= 0


def test_metrics_do_not_depend_on_trace_flag(small):
    a = run(small, trace=True, max_solutions=None)[-1].metrics
    b = run(small, trace=False, max_solutions=None)[-1].metrics
    assert (a.nodes_visited, a.placements_attempted, a.backtracks, a.solutions_found) == (
        b.nodes_visited,
        b.placements_attempted,
        b.backtracks,
        b.solutions_found,
    )


# ------------------------------------------------------- serialisation
def test_all_events_are_json_serialisable_and_tagged(small):
    evs = run(small, trace=True, max_solutions=None)
    seen = set()
    for e in evs:
        d = e.to_dict()
        assert json.loads(json.dumps(d)) == d
        assert d["type"] == e.type and d["seq"] == e.seq
        seen.add(d["type"])
    assert seen == {cls.type for cls in ALL_EVENT_TYPES}  # every event kind actually occurs


def test_wire_format_uses_camel_case_keys(small):
    evs = run(small, trace=True, max_solutions=2)
    acc = next(e for e in evs if e.type == "placement_accepted").to_dict()
    assert set(acc["placement"]) == {"pieceId", "x", "y", "width", "height", "rotated"}
    done = evs[-1].to_dict()
    assert set(done["metrics"]) == {
        "nodesVisited",
        "placementsAttempted",
        "placementsAccepted",
        "placementsRejected",
        "backtracks",
        "solutionsFound",
        "maxDepth",
        "elapsedMs",
    }
    sol = next(e for e in evs if e.type == "solution_found").to_dict()
    assert sol["solutionIndex"] == 0 and sol["solution"]["puzzleId"] == small.id
