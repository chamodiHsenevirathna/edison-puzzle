import type { Placement, Puzzle, Rectangle } from "@shared/edison";
import { canRotate, checkPlacement, coveredArea, labelFor, orientedSize } from "../lib/geometry";
import type { Feedback, GameAction, GameState, SavedGame, Stats } from "./types";

const ZERO_STATS: Stats = { actions: 0, undos: 0, redos: 0, rotations: 0 };

export function initialState(puzzle: Puzzle): GameState {
  return {
    puzzle,
    placements: [],
    selection: null,
    trayRotated: {},
    cursor: { x: 0, y: 0 },
    past: [],
    future: [],
    stats: { ...ZERO_STATS },
    clock: { accumulatedMs: 0, runningSince: null },
    timeline: [],
    feedback: null,
    completedMs: null,
  };
}

export function elapsedMs(state: GameState, now: number): number {
  if (state.completedMs !== null) return state.completedMs;
  const { accumulatedMs, runningSince } = state.clock;
  return accumulatedMs + (runningSince === null ? 0 : Math.max(0, now - runningSince));
}

export function unplacedPieces(state: GameState): Rectangle[] {
  const placed = new Set(state.placements.map((p) => p.pieceId));
  return state.puzzle.pieces.filter((p) => !placed.has(p.id));
}

export function isComplete(state: GameState): boolean {
  return state.placements.length === state.puzzle.pieces.length;
}

function say(state: GameState, kind: Feedback["kind"], text: string): GameState {
  return { ...state, feedback: { kind, text, seq: (state.feedback?.seq ?? 0) + 1 } };
}

function rect(state: GameState, id: string): Rectangle | undefined {
  return state.puzzle.pieces.find((p) => p.id === id);
}

function describe(state: GameState, pieceId: string): string {
  const r = rect(state, pieceId);
  return r ? `${labelFor(state.puzzle, pieceId)} (${r.width} × ${r.height})` : pieceId;
}

function failure(
  state: GameState,
  pieceId: string,
  x: number,
  y: number,
  c: { reason: string; blockedBy?: string },
) {
  const where = `(${x}, ${y})`;
  const text =
    c.reason === "overlap" && c.blockedBy
      ? `Piece ${describe(state, pieceId)} can't go at ${where}: it overlaps piece ${labelFor(state.puzzle, c.blockedBy)}.`
      : `Piece ${describe(state, pieceId)} can't go at ${where}: it would extend past the board edge.`;
  return say(state, "error", text);
}

/** Apply a board-changing step: history, stats, clock, timeline, completion. */
function commit(state: GameState, placements: Placement[], now: number, extra?: Partial<Stats>): GameState {
  const clock = state.clock.runningSince === null ? { ...state.clock, runningSince: now } : state.clock;
  const stats: Stats = {
    ...state.stats,
    actions: state.stats.actions + 1,
    rotations: state.stats.rotations + (extra?.rotations ?? 0),
  };
  let next: GameState = {
    ...state,
    placements,
    past: [...state.past, state.placements],
    future: [],
    stats,
    clock,
    selection: null,
    feedback: null,
  };
  const ms = elapsedMs(next, now);
  next = {
    ...next,
    timeline: [
      ...next.timeline,
      { ms, covered: coveredArea(placements), placed: placements.length, actions: stats.actions },
    ],
  };
  if (isComplete(next)) {
    next = {
      ...next,
      completedMs: ms,
      clock: { accumulatedMs: ms, runningSince: null },
      feedback: {
        kind: "success",
        text: "Puzzle complete. Every piece is placed and the board is fully covered.",
        seq: (state.feedback?.seq ?? 0) + 1,
      },
    };
  }
  return next;
}

function timelinePoint(state: GameState, now: number) {
  return {
    ms: elapsedMs(state, now),
    covered: coveredArea(state.placements),
    placed: state.placements.length,
    actions: state.stats.actions,
  };
}

export function reducer(state: GameState, action: GameAction): GameState {
  if (action.type === "reset") return initialState(state.puzzle);
  if (action.type === "restore") return restore(state, action.saved);
  if (action.type === "dismiss_feedback") return { ...state, feedback: null };
  if (state.completedMs !== null) return state; // frozen until reset

  const board = state.puzzle.board;
  switch (action.type) {
    case "select_tray": {
      if (state.placements.some((p) => p.pieceId === action.pieceId)) return state;
      return { ...state, selection: { source: "tray", pieceId: action.pieceId }, feedback: null };
    }
    case "select_board": {
      const p = state.placements.find((q) => q.pieceId === action.pieceId);
      if (!p) return state;
      return {
        ...state,
        selection: { source: "board", pieceId: p.pieceId },
        cursor: { x: p.x, y: p.y },
        feedback: null,
      };
    }
    case "clear_selection":
      return { ...state, selection: null };
    case "set_cursor":
      return {
        ...state,
        cursor: {
          x: Math.max(0, Math.min(board.width - 1, action.x)),
          y: Math.max(0, Math.min(board.height - 1, action.y)),
        },
      };
    case "move_cursor":
      return reducer(state, {
        type: "set_cursor",
        x: state.cursor.x + action.dx,
        y: state.cursor.y + action.dy,
      });

    case "rotate": {
      const sel = state.selection;
      if (!sel) return say(state, "info", "Select a piece first, then rotate it.");
      const r = rect(state, sel.pieceId);
      if (!r) return state;
      if (!canRotate(state.puzzle, r)) {
        return say(
          state,
          "info",
          r.width === r.height
            ? "A square piece looks the same rotated."
            : "Rotation is turned off for this puzzle.",
        );
      }
      if (sel.source === "tray") {
        const rotated = !state.trayRotated[r.id];
        return {
          ...state,
          trayRotated: { ...state.trayRotated, [r.id]: rotated },
          stats: { ...state.stats, rotations: state.stats.rotations + 1 },
          feedback: null,
        };
      }
      const cur = state.placements.find((p) => p.pieceId === r.id);
      if (!cur) return state;
      const rotated = !cur.rotated;
      const size = orientedSize(r, rotated);
      // keep the top-left corner, but slide back inside the board if the new shape sticks out
      const x = Math.min(cur.x, board.width - size.width);
      const y = Math.min(cur.y, board.height - size.height);
      const c = checkPlacement(board, state.placements, { pieceId: r.id, x, y, ...size });
      if (!c.ok) return failure(state, r.id, x, y, c);
      const updated = state.placements.map((p) =>
        p.pieceId === r.id ? { ...p, x, y, ...size, rotated } : p,
      );
      return {
        ...commit(state, updated, action.now, { rotations: 1 }),
        selection: { source: "board", pieceId: r.id },
      };
    }

    case "place": {
      const sel = state.selection;
      if (!sel) return say(state, "info", "Select a piece first, then choose where it goes.");
      const r = rect(state, sel.pieceId);
      if (!r) return state;
      const x = action.x ?? state.cursor.x;
      const y = action.y ?? state.cursor.y;
      if (sel.source === "tray") {
        const rotated = !!state.trayRotated[r.id] && canRotate(state.puzzle, r);
        const size = orientedSize(r, rotated);
        const c = checkPlacement(board, state.placements, { pieceId: r.id, x, y, ...size });
        if (!c.ok) return failure({ ...state, cursor: { x, y } }, r.id, x, y, c);
        const placed: Placement = { pieceId: r.id, x, y, ...size, rotated };
        return commit({ ...state, cursor: { x, y } }, [...state.placements, placed], action.now);
      }
      const cur = state.placements.find((p) => p.pieceId === r.id);
      if (!cur) return state;
      if (cur.x === x && cur.y === y) return { ...state, selection: null };
      const c = checkPlacement(board, state.placements, {
        pieceId: r.id,
        x,
        y,
        width: cur.width,
        height: cur.height,
      });
      if (!c.ok) return failure(state, r.id, x, y, c);
      const moved = state.placements.map((p) => (p.pieceId === r.id ? { ...p, x, y } : p));
      return commit({ ...state, cursor: { x, y } }, moved, action.now);
    }

    case "nudge": {
      const sel = state.selection;
      if (!sel || sel.source !== "board")
        return reducer(state, { type: "move_cursor", dx: action.dx, dy: action.dy });
      const cur = state.placements.find((p) => p.pieceId === sel.pieceId);
      if (!cur) return state;
      const x = cur.x + action.dx;
      const y = cur.y + action.dy;
      const c = checkPlacement(board, state.placements, {
        pieceId: cur.pieceId,
        x,
        y,
        width: cur.width,
        height: cur.height,
      });
      if (!c.ok) return failure(state, cur.pieceId, x, y, c);
      const moved = state.placements.map((p) => (p.pieceId === cur.pieceId ? { ...p, x, y } : p));
      return { ...commit(state, moved, action.now), selection: sel, cursor: { x, y } };
    }

    case "remove": {
      const id =
        action.pieceId ?? (state.selection?.source === "board" ? state.selection.pieceId : undefined);
      if (!id || !state.placements.some((p) => p.pieceId === id))
        return say(state, "info", "Select a placed piece to remove it.");
      return commit(
        state,
        state.placements.filter((p) => p.pieceId !== id),
        action.now,
      );
    }

    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return say(state, "info", "Nothing to undo.");
      const next: GameState = {
        ...state,
        placements: prev,
        past: state.past.slice(0, -1),
        future: [...state.future, state.placements],
        stats: { ...state.stats, undos: state.stats.undos + 1 },
        selection: null,
        feedback: null,
      };
      return { ...next, timeline: [...next.timeline, timelinePoint(next, action.now)] };
    }
    case "redo": {
      const nxt = state.future[state.future.length - 1];
      if (!nxt) return say(state, "info", "Nothing to redo.");
      const next: GameState = {
        ...state,
        placements: nxt,
        past: [...state.past, state.placements],
        future: state.future.slice(0, -1),
        stats: { ...state.stats, redos: state.stats.redos + 1 },
        selection: null,
        feedback: null,
      };
      const done = isComplete(next);
      const ms = elapsedMs(next, action.now);
      const withPoint = { ...next, timeline: [...next.timeline, timelinePoint(next, action.now)] };
      return done
        ? {
            ...withPoint,
            completedMs: ms,
            clock: { accumulatedMs: ms, runningSince: null },
            feedback: {
              kind: "success",
              text: "Puzzle complete. Every piece is placed and the board is fully covered.",
              seq: (state.feedback?.seq ?? 0) + 1,
            },
          }
        : withPoint;
    }
  }
  return state;
}

/** Rebuild state from storage, discarding anything that no longer fits the puzzle. */
function restore(state: GameState, saved: SavedGame): GameState {
  const base = initialState(state.puzzle);
  if (saved.puzzleId !== state.puzzle.id) return base;
  const kept: Placement[] = [];
  for (const p of Array.isArray(saved.placements) ? saved.placements : []) {
    if (typeof p !== "object" || p === null) continue;
    const r = rect(base, p.pieceId);
    if (!r || kept.some((k) => k.pieceId === p.pieceId)) continue;
    if (p.rotated && !canRotate(state.puzzle, r)) continue;
    const size = orientedSize(r, p.rotated);
    if (size.width !== p.width || size.height !== p.height) continue;
    if (!checkPlacement(state.puzzle.board, kept, p).ok) continue;
    kept.push(p);
  }
  const complete = kept.length === state.puzzle.pieces.length;
  const ms = Math.max(0, Number.isFinite(saved.elapsedMs) ? saved.elapsedMs : 0);
  return {
    ...base,
    placements: kept,
    stats: { ...ZERO_STATS, ...saved.stats },
    clock: { accumulatedMs: ms, runningSince: null },
    timeline: Array.isArray(saved.timeline) ? saved.timeline.slice(-500) : [],
    completedMs: complete ? ms : null,
  };
}

export function toSaved(state: GameState, now: number): SavedGame {
  return {
    version: 1,
    puzzleId: state.puzzle.id,
    placements: state.placements,
    stats: state.stats,
    elapsedMs: elapsedMs(state, now),
    timeline: state.timeline.slice(-500),
  };
}
