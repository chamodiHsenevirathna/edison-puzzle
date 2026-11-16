import type { Placement, Puzzle } from "@shared/edison";

export interface Selection {
  source: "tray" | "board";
  pieceId: string;
}

export interface Feedback {
  kind: "error" | "info" | "success";
  text: string;
  /** Increments on every message so identical messages are re-announced. */
  seq: number;
}

export interface Stats {
  /** Board-changing actions: place, move, rotate in place, remove. Undo/redo are counted apart. */
  actions: number;
  undos: number;
  redos: number;
  /** Successful rotations (tray or board). */
  rotations: number;
}

export interface TimelinePoint {
  ms: number;
  covered: number;
  placed: number;
  actions: number;
}

export interface Clock {
  accumulatedMs: number;
  runningSince: number | null;
}

export interface GameState {
  puzzle: Puzzle;
  placements: Placement[];
  selection: Selection | null;
  trayRotated: Record<string, boolean>;
  cursor: { x: number; y: number };
  past: Placement[][];
  future: Placement[][];
  stats: Stats;
  clock: Clock;
  timeline: TimelinePoint[];
  feedback: Feedback | null;
  /** Elapsed ms at completion; the board is frozen once set. */
  completedMs: number | null;
}

/** What is persisted between visits (undo history is intentionally not). */
export interface SavedGame {
  version: 1;
  puzzleId: string;
  placements: Placement[];
  stats: Stats;
  elapsedMs: number;
  timeline: TimelinePoint[];
}

export type GameAction =
  | { type: "select_tray"; pieceId: string }
  | { type: "select_board"; pieceId: string }
  | { type: "clear_selection" }
  | { type: "rotate"; now: number }
  | { type: "move_cursor"; dx: number; dy: number }
  | { type: "set_cursor"; x: number; y: number }
  | { type: "place"; now: number; x?: number; y?: number }
  | { type: "nudge"; dx: number; dy: number; now: number }
  | { type: "remove"; now: number; pieceId?: string }
  | { type: "undo"; now: number }
  | { type: "redo"; now: number }
  | { type: "reset" }
  | { type: "restore"; saved: SavedGame }
  | { type: "dismiss_feedback" };
