/**
 * Edison Puzzle -- shared domain & solver-event types.
 *
 * Wire format of the Python engine (`src/edison_puzzle`, the `to_dict()` methods).
 * Framework-agnostic: no React, no UI, no styling concerns.
 *
 * Coordinates: (0, 0) is the top-left cell, x grows right, y grows down.
 * All sizes/positions are in board cells (integers).
 */

/** Board dimensions in cells. */
export interface Board {
  width: number;
  height: number;
}

/** A piece definition. `id` distinguishes pieces that share dimensions. */
export interface Rectangle {
  id: string;
  width: number;
  height: number;
}

/**
 * A piece placed on the board. `width`/`height` are the dimensions AS PLACED
 * (already swapped when `rotated` is true). Squares are never reported rotated.
 */
export interface Placement {
  pieceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}

/** A puzzle: place every piece exactly once so the board is fully covered. */
export interface Puzzle {
  id: string;
  name: string;
  board: Board;
  pieces: Rectangle[];
  allowRotation: boolean;
}

/** A complete tiling. `placements` are in the order the solver placed them. */
export interface Solution {
  puzzleId: string;
  placements: Placement[];
}

export interface SolverMetrics {
  nodesVisited: number;
  placementsAttempted: number;
  placementsAccepted: number;
  placementsRejected: number;
  backtracks: number;
  solutionsFound: number;
  maxDepth: number;
  elapsedMs: number;
}

// --------------------------------------------------------------------------
// Solver events
// --------------------------------------------------------------------------

export type RejectionReason = "out_of_bounds" | "overlap";

export type SearchStatus =
  | "exhausted" //      whole search space explored
  | "max_solutions" //  stopped: requested number of solutions found
  | "node_limit" //     stopped: node budget used up
  | "time_limit" //     stopped: wall-clock budget used up
  | "cancelled" //      stopped: the client disconnected / cancel() was called
  | "event_limit" //    stopped by the API: the event budget was used up
  | "not_solvable"; //  rejected before searching (e.g. piece area != board area)

interface BaseEvent {
  /** 0-based, strictly increasing within one run. */
  seq: number;
}

/**
 * Snapshot fields shared by step events. Each event is self-contained: it can
 * be rendered without replaying earlier events.
 *  - `placements`: pieces on the board as of this event
 *  - `remaining`:  ids of pieces not on the board as of this event
 *  - `depth`:      pieces on the board when the search node was entered (root = 0)
 */
interface StepState {
  depth: number;
  placements: Placement[];
  remaining: string[];
}

export interface SolverStartedEvent extends BaseEvent {
  type: "solver_started";
  puzzle: Puzzle;
  maxSolutions: number | null;
  trace: boolean;
}

/** The solver chose `pieceId` to try at the first free cell (x, y). */
export interface PieceSelectedEvent extends BaseEvent, StepState {
  type: "piece_selected";
  pieceId: string;
  x: number;
  y: number;
}

/** Candidate is NOT yet in `placements`. */
export interface PlacementAttemptedEvent extends BaseEvent, StepState {
  type: "placement_attempted";
  placement: Placement;
}

/** `placement` IS now in `placements`. */
export interface PlacementAcceptedEvent extends BaseEvent, StepState {
  type: "placement_accepted";
  placement: Placement;
}

/** Candidate is NOT in `placements`. */
export interface PlacementRejectedEvent extends BaseEvent, StepState {
  type: "placement_rejected";
  placement: Placement;
  reason: RejectionReason;
}

/** The subtree under `placement` is exhausted; it is still in `placements`. */
export interface BacktrackStartedEvent extends BaseEvent, StepState {
  type: "backtrack_started";
  placement: Placement;
}

/** `removed` is no longer in `placements`. */
export interface BacktrackCompletedEvent extends BaseEvent, StepState {
  type: "backtrack_completed";
  removed: Placement;
}

export interface SolutionFoundEvent extends BaseEvent {
  type: "solution_found";
  /** 0-based. */
  solutionIndex: number;
  solution: Solution;
}

export interface SearchCompletedEvent extends BaseEvent {
  type: "search_completed";
  status: SearchStatus;
  solutionsFound: number;
  metrics: SolverMetrics;
  message: string | null;
}

/** Discriminated union on `type`. */
export type SolverEvent =
  | SolverStartedEvent
  | PieceSelectedEvent
  | PlacementAttemptedEvent
  | PlacementAcceptedEvent
  | PlacementRejectedEvent
  | BacktrackStartedEvent
  | BacktrackCompletedEvent
  | SolutionFoundEvent
  | SearchCompletedEvent;

export type SolverEventType = SolverEvent["type"];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * Wire encoding used by the streaming endpoint (`compact=true`): step events
 * omit the `placements` / `remaining` snapshots. Rebuild the board by replaying
 * `placement_accepted` (push) and `backtrack_completed` (pop); see
 * frontend/src/explorer/replay.ts.
 */
export type CompactSolverEvent = DistributiveOmit<SolverEvent, "placements" | "remaining">;

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

export type ValidationErrorCode =
  | "unknown_piece"
  | "duplicate_piece"
  | "missing_piece"
  | "dimension_mismatch"
  | "rotation_not_allowed"
  | "rotation_flag_mismatch"
  | "out_of_bounds"
  | "overlap"
  | "uncovered_cells";

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  pieceId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
