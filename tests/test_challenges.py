import pytest

from edison_puzzle import SolverOptions, solve
from edison_puzzle.catalog import builtin_puzzles
from edison_puzzle.challenges import CHALLENGES, DIFFICULTIES, Challenge, evaluate, get_challenge

PUZZLES = {p.id: p for p in builtin_puzzles()}


def test_ids_unique_and_difficulties_valid():
    assert len({c.id for c in CHALLENGES}) == len(CHALLENGES)
    assert {c.difficulty for c in CHALLENGES} <= set(DIFFICULTIES)
    assert len({c.difficulty for c in CHALLENGES}) >= 3


@pytest.mark.parametrize("c", CHALLENGES, ids=lambda c: c.id)
def test_every_challenge_references_a_real_puzzle_and_is_achievable(c):
    puz = PUZZLES[c.puzzle_id]
    n = len(puz.pieces)
    # a perfect run: one action per piece, no undo, instantly
    if c.max_actions is not None:
        assert c.max_actions >= n, "constraint tighter than the theoretical minimum"
    r = evaluate(c, solved=True, time_ms=1000, actions=n, undos=0)
    assert r.passed, r.feedback
    # and the puzzle genuinely has a tiling under the puzzle's own rules
    assert solve(puz, SolverOptions(time_limit_s=10)).solutions


def test_get_challenge_unknown_raises():
    with pytest.raises(KeyError):
        get_challenge("nope")


C = Challenge("t", "T", "easy", "p", "o", "d", max_actions=10, max_seconds=60, max_undos=1)


def check(r, cid):
    return next(x for x in r.checks if x.id == cid)


@pytest.mark.parametrize("actions,ok", [(9, True), (10, True), (11, False)])
def test_action_limit_is_inclusive(actions, ok):
    r = evaluate(C, solved=True, time_ms=1000, actions=actions, undos=0)
    assert check(r, "actions").passed is ok and r.passed is ok


@pytest.mark.parametrize("undos,ok", [(0, True), (1, True), (2, False)])
def test_undo_limit_is_inclusive(undos, ok):
    assert evaluate(C, solved=True, time_ms=1000, actions=5, undos=undos).passed is ok


@pytest.mark.parametrize("ms,ok", [(59_999, True), (60_000, True), (60_001, False)])
def test_time_limit_is_inclusive(ms, ok):
    assert evaluate(C, solved=True, time_ms=ms, actions=5, undos=0).passed is ok


def test_unsolved_never_passes_even_when_constraints_are_met():
    r = evaluate(C, solved=False, time_ms=1, actions=1, undos=0)
    assert not r.passed and not r.solved and "not a complete" in r.feedback


def test_feedback_names_the_failed_constraint():
    r = evaluate(C, solved=True, time_ms=1000, actions=50, undos=0)
    assert not r.passed and "10 board actions" in r.feedback


def test_unconstrained_challenge_only_needs_the_tiling():
    plain = Challenge("p", "P", "easy", "x", "o", "d")
    assert evaluate(plain, solved=True, time_ms=10**9, actions=10**6, undos=99).passed
    assert [c.id for c in evaluate(plain, solved=True, time_ms=1, actions=1, undos=0).checks] == ["solved"]


def test_result_serialises():
    d = evaluate(C, solved=True, time_ms=1000, actions=5, undos=0).to_dict()
    assert d["passed"] is True and {c["id"] for c in d["checks"]} == {"solved", "actions", "undos", "time"}
