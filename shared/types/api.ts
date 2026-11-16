/**
 * HTTP API types. These describe the implemented backend (src/edison_api);
 * see docs/api-contracts.md. Framework-independent.
 */
import type {
  Board,
  CompactSolverEvent,
  Placement,
  Puzzle,
  Rectangle,
  SearchStatus,
  Solution,
  SolverMetrics,
  ValidationResult,
} from "./edison";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Array<{ field?: string; message?: string; code?: string; severity?: string; pieceId?: string }>;
  };
}

// ---- puzzles ---------------------------------------------------------------

export interface PuzzleSummary {
  id: string;
  name: string;
  board: Board;
  pieceCount: number;
  allowRotation: boolean;
  builtIn: boolean;
}
export interface ListPuzzlesResponse {
  puzzles: PuzzleSummary[];
}

export interface PuzzleDetail extends Puzzle {
  builtIn: boolean;
  piecesArea: number;
  boardArea: number;
  areaBalanced: boolean;
}

/** Body of POST /api/puzzles and POST /api/puzzles/analyze. */
export interface PuzzleInput {
  name: string;
  board: Board;
  pieces: Array<{ id?: string; width: number; height: number }>;
  allowRotation: boolean;
}

export type IssueSeverity = "error" | "warning" | "info";
export interface PuzzleIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  pieceId?: string;
}
export interface PuzzleAnalysis {
  canSave: boolean;
  /** "impossible" = proven by a necessary condition; "unknown" = only the solver can say. */
  solvability: "impossible" | "unknown";
  boardArea: number | null;
  piecesArea: number | null;
  areaDifference: number | null;
  issues: PuzzleIssue[];
}

export interface Limits {
  maxBoardSide: number;
  maxPieces: number;
  maxCustomPuzzles: number;
  solver: {
    defaultMaxNodes: number;
    hardMaxNodes: number;
    defaultTimeLimitSeconds: number;
    hardTimeLimitSeconds: number;
    defaultMaxEvents: number;
    hardMaxEvents: number;
    maxConcurrentSolves: number;
  };
}

// ---- solving ---------------------------------------------------------------

export interface SolveRequest {
  maxSolutions?: number | null; // default 1; null = all
  events?: "none" | "milestones" | "full";
  maxNodes?: number | null;
  timeLimitSeconds?: number | null;
  maxEvents?: number | null;
  save?: boolean;
}
export interface SolveResponse {
  puzzleId: string;
  status: SearchStatus;
  solutions: Solution[];
  metrics: SolverMetrics;
  message: string | null;
  events?: CompactSolverEvent[];
  eventsTruncated?: boolean;
  eventsCompact?: boolean;
}

/** Payload of the final `done` SSE frame of GET /api/puzzles/{id}/solve/stream. */
export interface StreamDone {
  status: SearchStatus;
  solutionsFound: number;
  metrics: SolverMetrics;
  message: string | null;
  eventsSent: number;
  truncated: boolean;
}

export type ValidateResponse = ValidationResult;

// ---- solutions -------------------------------------------------------------

export interface GallerySolution {
  index: number;
  familyId: number;
  canonical: boolean;
  transform: string;
  transformLabel: string;
  placements: Placement[];
}
export interface SolutionFamily {
  familyId: number;
  canonicalIndex: number;
  distinctImages: number;
  members: Array<{ solutionIndex: number; transform: string; label: string }>;
}
export interface SolutionsResponse {
  puzzleId: string;
  exhaustive: boolean;
  count: number;
  familyCount: number;
  boardSymmetries: number;
  solutions: GallerySolution[];
  families: SolutionFamily[];
}

// ---- challenges & attempts -------------------------------------------------

export type Difficulty = "easy" | "medium" | "hard" | "expert";
export interface Challenge {
  id: string;
  title: string;
  difficulty: Difficulty;
  puzzleId: string;
  objective: string;
  description: string;
  constraints: { maxActions: number | null; maxSeconds: number | null; maxUndos: number | null };
}
export interface ChallengeCheck {
  id: string;
  label: string;
  passed: boolean;
  actual: number | null;
  limit: number | null;
}
export interface ChallengeResult {
  challengeId: string;
  solved: boolean;
  passed: boolean;
  checks: ChallengeCheck[];
  feedback: string;
}

export interface AttemptRequest {
  clientId: string;
  puzzleId: string;
  challengeId?: string | null;
  placements: Placement[];
  timeMs: number;
  actions: number;
  undos: number;
}
export interface AttemptResponse {
  valid: boolean;
  validation: ValidationResult;
  minimumActions: number;
  attemptId: number | null;
  challenge: ChallengeResult | null;
}
export interface ProgressResponse {
  puzzles: Record<string, { completions: number; bestTimeMs: number | null; bestActions: number | null }>;
  challenges: Record<
    string,
    { attempts: number; passed: boolean; bestTimeMs: number | null; bestActions: number | null }
  >;
}

export type { Rectangle };
