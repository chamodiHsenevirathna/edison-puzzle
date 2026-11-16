import json
import threading

from conftest import make_puzzle
from edison_puzzle import Solver, SolverOptions, original_puzzle, solve
from edison_puzzle.events import replay_placements

SMALL = make_puzzle(4, 4, [(2, 2), (2, 2), (1, 2), (1, 2), (1, 2), (1, 2)])


def test_compact_dicts_omit_snapshots_but_keep_everything_else():
    evs = list(Solver(SMALL, SolverOptions(trace=True, max_solutions=3)).run())
    for e in evs:
        full, compact = e.to_dict(), e.to_dict(compact=True)
        assert "placements" not in compact and "remaining" not in compact
        assert {k: v for k, v in full.items() if k not in ("placements", "remaining")} == compact


def test_replaying_compact_events_reproduces_every_full_snapshot():
    evs = list(Solver(SMALL, SolverOptions(trace=True, max_solutions=None)).run())
    for ev, stack in replay_placements(evs):
        d = ev.to_dict()
        if "placements" in d:
            assert d["placements"] == [p.to_dict() for p in stack], f"seq {ev.seq} {ev.type}"


def test_compact_is_much_smaller_on_the_original_puzzle():
    evs = list(Solver(original_puzzle(), SolverOptions(trace=True)).run())
    full = len(json.dumps([e.to_dict() for e in evs]))
    compact = len(json.dumps([e.to_dict(compact=True) for e in evs]))
    assert len(evs) == 23_291
    assert compact < full / 3


def test_cancel_stops_a_running_search_with_cancelled_status():
    s = Solver(original_puzzle(), SolverOptions(max_solutions=None))
    it = s.run()
    next(it)
    s.cancel()
    last = list(it)[-1]
    assert last.type == "search_completed" and last.status == "cancelled"


def test_cancel_from_another_thread():
    s = Solver(original_puzzle(), SolverOptions(max_solutions=None))
    threading.Timer(0.05, s.cancel).start()
    last = list(s.run())[-1]
    assert last.status == "cancelled"
    assert last.metrics.nodes_visited > 0


def test_metrics_available_live_and_match_final():
    s = Solver(SMALL, SolverOptions(max_solutions=None))
    final = [e for e in s.run()][-1]
    assert s.metrics().nodes_visited == final.metrics.nodes_visited


def test_solve_result_unaffected():
    assert solve(SMALL).solutions
