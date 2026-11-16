import type { Puzzle } from "@shared/edison";
import { elapsedMs, initialState, isComplete, reducer, toSaved, unplacedPieces } from "./reducer";
import type { GameAction, GameState } from "./types";

// 4x4 board, three pieces: A 4x2, B 2x2, C 2x2  (area 16)
const puzzle: Puzzle = {
  id: "t",
  name: "t",
  board: { width: 4, height: 4 },
  allowRotation: true,
  pieces: [
    { id: "a", width: 4, height: 2 },
    { id: "b", width: 2, height: 2 },
    { id: "c", width: 2, height: 2 },
  ],
};
const run = (s: GameState, ...actions: GameAction[]) => actions.reduce(reducer, s);
const sel = (id: string): GameAction => ({ type: "select_tray", pieceId: id });
const put = (x: number, y: number, now = 1000): GameAction => ({ type: "place", x, y, now });

function solved(now = 1000) {
  return run(
    initialState(puzzle),
    sel("a"),
    put(0, 0, now),
    sel("b"),
    put(0, 2, now + 1),
    sel("c"),
    put(2, 2, now + 2),
  );
}

describe("placing", () => {
  it("places a selected tray piece and tracks remaining", () => {
    const s = run(initialState(puzzle), sel("a"), put(0, 0));
    expect(s.placements).toEqual([{ pieceId: "a", x: 0, y: 0, width: 4, height: 2, rotated: false }]);
    expect(unplacedPieces(s).map((p) => p.id)).toEqual(["b", "c"]);
    expect(s.selection).toBeNull();
    expect(s.stats.actions).toBe(1);
  });
  it("rejects out-of-bounds placement with an explanation and leaves state unchanged", () => {
    const s0 = run(initialState(puzzle), sel("a"));
    const s = reducer(s0, put(1, 0));
    expect(s.placements).toEqual([]);
    expect(s.feedback?.kind).toBe("error");
    expect(s.feedback?.text).toMatch(/board edge/);
    expect(s.stats.actions).toBe(0);
    expect(s.selection).toEqual({ source: "tray", pieceId: "a" }); // still selected to try again
  });
  it("rejects overlap and names the blocking piece", () => {
    const s = run(initialState(puzzle), sel("a"), put(0, 0), sel("b"), put(1, 1));
    expect(s.placements).toHaveLength(1);
    expect(s.feedback?.text).toMatch(/overlaps piece A/);
  });
  it("places at the keyboard cursor when no coordinates are given", () => {
    const s = run(
      initialState(puzzle),
      sel("b"),
      { type: "set_cursor", x: 2, y: 2 },
      { type: "place", now: 5 },
    );
    expect(s.placements[0]).toMatchObject({ pieceId: "b", x: 2, y: 2 });
  });
  it("asks to select a piece first", () => {
    expect(reducer(initialState(puzzle), put(0, 0)).feedback?.kind).toBe("info");
  });
  it("clamps the cursor to the board", () => {
    const s = run(initialState(puzzle), { type: "set_cursor", x: 99, y: -4 });
    expect(s.cursor).toEqual({ x: 3, y: 0 });
  });
});

describe("rotation", () => {
  it("rotating in the tray changes the placed orientation", () => {
    const s = run(initialState(puzzle), sel("a"), { type: "rotate", now: 1 }, put(0, 0));
    expect(s.placements[0]).toMatchObject({ width: 2, height: 4, rotated: true });
    expect(s.stats.rotations).toBe(1);
    expect(s.stats.actions).toBe(1); // tray rotation is free; only the placement counts
  });
  it("squares and rotation-disabled puzzles do not rotate", () => {
    expect(run(initialState(puzzle), sel("b"), { type: "rotate", now: 1 }).feedback?.text).toMatch(/square/);
    const fixed = initialState({ ...puzzle, allowRotation: false });
    expect(run(fixed, sel("a"), { type: "rotate", now: 1 }).feedback?.text).toMatch(/turned off/);
  });
  it("rotating a placed piece swaps its footprint and counts as an action", () => {
    const s = run(
      initialState(puzzle),
      sel("a"),
      put(0, 0),
      { type: "select_board", pieceId: "a" },
      { type: "rotate", now: 2 },
    );
    expect(s.placements[0]).toMatchObject({ x: 0, y: 0, width: 2, height: 4, rotated: true });
    expect(s.stats.actions).toBe(2);
  });
  it("slides a rotated piece back inside the board when it would stick out", () => {
    let s = run(initialState(puzzle), sel("a"), { type: "rotate", now: 1 }, put(2, 0)); // 2x4 at x=2
    s = run(s, { type: "select_board", pieceId: "a" }, { type: "rotate", now: 2 }); // back to 4x2: x must become 0
    expect(s.placements[0]).toMatchObject({ x: 0, width: 4, height: 2 });
  });
  it("refuses an in-place rotation that would overlap", () => {
    let s = run(initialState(puzzle), sel("a"), put(0, 0), sel("b"), put(0, 2)); // a: 4x2 top, b below at left
    s = run(s, { type: "select_board", pieceId: "a" }, { type: "rotate", now: 2 }); // 2x4 would hit b
    expect(s.placements.find((p) => p.pieceId === "a")).toMatchObject({ width: 4, height: 2 });
    expect(s.feedback?.kind).toBe("error");
  });
});

describe("moving and removing", () => {
  it("moves a placed piece", () => {
    const s = run(
      initialState(puzzle),
      sel("b"),
      put(0, 0),
      { type: "select_board", pieceId: "b" },
      put(2, 2),
    );
    expect(s.placements[0]).toMatchObject({ x: 2, y: 2 });
  });
  it("moving onto another piece fails and keeps the original position", () => {
    const s = run(
      initialState(puzzle),
      sel("b"),
      put(0, 0),
      sel("c"),
      put(2, 0),
      { type: "select_board", pieceId: "b" },
      put(1, 0),
    );
    expect(s.placements.find((p) => p.pieceId === "b")).toMatchObject({ x: 0 });
    expect(s.feedback?.kind).toBe("error");
  });
  it("nudges the selected placed piece by one cell", () => {
    const s = run(
      initialState(puzzle),
      sel("b"),
      put(0, 0),
      { type: "select_board", pieceId: "b" },
      { type: "nudge", dx: 1, dy: 0, now: 3 },
    );
    expect(s.placements[0]).toMatchObject({ x: 1 });
    expect(s.selection).toEqual({ source: "board", pieceId: "b" });
  });
  it("arrow keys move the cursor when nothing placed is selected", () => {
    const s = run(initialState(puzzle), { type: "nudge", dx: 1, dy: 1, now: 3 });
    expect(s.cursor).toEqual({ x: 1, y: 1 });
    expect(s.stats.actions).toBe(0);
  });
  it("removes a piece back to the tray", () => {
    const s = run(initialState(puzzle), sel("b"), put(0, 0), { type: "remove", pieceId: "b", now: 4 });
    expect(s.placements).toEqual([]);
    expect(unplacedPieces(s)).toHaveLength(3);
    expect(s.stats.actions).toBe(2);
  });
  it("remove with nothing to remove explains itself", () => {
    expect(reducer(initialState(puzzle), { type: "remove", now: 1 }).feedback?.kind).toBe("info");
  });
});

describe("undo / redo", () => {
  it("undo restores the previous placements, redo reapplies", () => {
    const s1 = run(initialState(puzzle), sel("a"), put(0, 0), sel("b"), put(0, 2));
    const u = reducer(s1, { type: "undo", now: 9 });
    expect(u.placements.map((p) => p.pieceId)).toEqual(["a"]);
    expect(u.stats.undos).toBe(1);
    const r = reducer(u, { type: "redo", now: 10 });
    expect(r.placements.map((p) => p.pieceId)).toEqual(["a", "b"]);
    expect(r.stats.redos).toBe(1);
  });
  it("a new action clears the redo stack", () => {
    let s = run(initialState(puzzle), sel("a"), put(0, 0));
    s = reducer(s, { type: "undo", now: 5 });
    s = run(s, sel("b"), put(0, 0, 6));
    expect(s.future).toEqual([]);
    expect(reducer(s, { type: "redo", now: 7 }).feedback?.text).toMatch(/Nothing to redo/);
  });
  it("undo on a fresh game is harmless", () => {
    const s = reducer(initialState(puzzle), { type: "undo", now: 1 });
    expect(s.placements).toEqual([]);
    expect(s.stats.undos).toBe(0);
  });
  it("undoes a removal", () => {
    const s = run(
      initialState(puzzle),
      sel("b"),
      put(0, 0),
      { type: "remove", pieceId: "b", now: 3 },
      { type: "undo", now: 4 },
    );
    expect(s.placements).toHaveLength(1);
  });
});

describe("completion", () => {
  it("completes when all pieces are placed and freezes the board", () => {
    const s = solved();
    expect(isComplete(s)).toBe(true);
    expect(s.completedMs).not.toBeNull();
    expect(s.feedback?.kind).toBe("success");
    const after = reducer(s, { type: "remove", pieceId: "a", now: 99999 });
    expect(after.placements).toHaveLength(3);
    expect(reducer(s, { type: "undo", now: 99999 }).placements).toHaveLength(3);
  });
  it("records minimal actions for a straight solve", () => {
    expect(solved().stats).toMatchObject({ actions: 3, undos: 0 });
  });
  it("reset starts over", () => {
    const s = reducer(solved(), { type: "reset" });
    expect(s.placements).toEqual([]);
    expect(s.completedMs).toBeNull();
    expect(s.stats.actions).toBe(0);
  });
  it("a different tiling also completes (placement order independent)", () => {
    const s = run(initialState(puzzle), sel("c"), put(0, 0), sel("b"), put(2, 0), sel("a"), put(0, 2));
    expect(isComplete(s)).toBe(true);
  });
});

describe("clock and timeline", () => {
  it("starts on the first action and stops at completion", () => {
    let s = initialState(puzzle);
    expect(elapsedMs(s, 5000)).toBe(0);
    s = run(s, sel("a"), put(0, 0, 10_000));
    expect(elapsedMs(s, 10_500)).toBe(500);
    s = run(s, sel("b"), put(0, 2, 11_000), sel("c"), put(2, 2, 12_000));
    expect(s.completedMs).toBe(2000);
    expect(elapsedMs(s, 999_999)).toBe(2000);
  });
  it("selecting, rotating in the tray and cursor moves do not start the clock", () => {
    const s = run(
      initialState(puzzle),
      sel("a"),
      { type: "rotate", now: 5 },
      { type: "move_cursor", dx: 1, dy: 0 },
    );
    expect(s.clock.runningSince).toBeNull();
  });
  it("records a timeline point per board action and per undo", () => {
    const s = reducer(run(initialState(puzzle), sel("a"), put(0, 0, 1000), sel("b"), put(0, 2, 2000)), {
      type: "undo",
      now: 3000,
    });
    expect(s.timeline.map((t) => [t.placed, t.covered, t.actions])).toEqual([
      [1, 8, 1],
      [2, 12, 2],
      [1, 8, 2],
    ]);
  });
});

describe("save / restore", () => {
  it("round-trips placements, stats and elapsed time", () => {
    const s = run(initialState(puzzle), sel("a"), put(0, 0, 1000), sel("b"), put(0, 2, 3000));
    const saved = toSaved(s, 3500);
    const back = reducer(initialState(puzzle), { type: "restore", saved });
    expect(back.placements).toEqual(s.placements);
    expect(back.stats).toEqual(s.stats);
    expect(elapsedMs(back, 99999)).toBe(2500); // paused until the next action
    expect(back.past).toEqual([]); // undo history is not persisted
  });
  it("drops corrupt or conflicting pieces instead of crashing", () => {
    const saved = {
      version: 1 as const,
      puzzleId: "t",
      elapsedMs: 10,
      timeline: [],
      stats: { actions: 3, undos: 0, redos: 0, rotations: 0 },
      placements: [
        { pieceId: "a", x: 0, y: 0, width: 4, height: 2, rotated: false },
        { pieceId: "b", x: 1, y: 1, width: 2, height: 2, rotated: false }, // overlaps a
        { pieceId: "zzz", x: 0, y: 2, width: 1, height: 1, rotated: false }, // unknown
        { pieceId: "c", x: 0, y: 2, width: 9, height: 9, rotated: false }, // wrong size
      ],
    };
    expect(
      reducer(initialState(puzzle), { type: "restore", saved }).placements.map((p) => p.pieceId),
    ).toEqual(["a"]);
  });
  it("ignores saved data for another puzzle", () => {
    const saved = toSaved(run(initialState(puzzle), sel("a"), put(0, 0)), 1);
    expect(
      reducer(initialState(puzzle), { type: "restore", saved: { ...saved, puzzleId: "other" } }).placements,
    ).toEqual([]);
  });
  it("a fully saved solution restores as complete", () => {
    const back = reducer(initialState(puzzle), { type: "restore", saved: toSaved(solved(), 5000) });
    expect(back.completedMs).not.toBeNull();
  });
});

describe("restore hardening", () => {
  const saved = (over: object) => ({
    version: 1 as const,
    puzzleId: "t",
    placements: [],
    stats: { actions: 1, undos: 0, redos: 0, rotations: 0 },
    elapsedMs: 10,
    timeline: [],
    ...over,
  });
  it("discards a rotated placement when rotation is off for the puzzle", () => {
    const noRot = { ...puzzle, allowRotation: false };
    const s = reducer(initialState(noRot), {
      type: "restore",
      saved: saved({ placements: [{ pieceId: "a", x: 0, y: 0, width: 2, height: 4, rotated: true }] }),
    });
    expect(s.placements).toEqual([]);
  });
  it("does not crash on a saved game with a non-array timeline or junk placements", () => {
    const s = reducer(initialState(puzzle), {
      type: "restore",
      saved: saved({ timeline: null, placements: [null, 7] }),
    });
    expect(s.placements).toEqual([]);
    expect(s.timeline).toEqual([]);
  });
});
