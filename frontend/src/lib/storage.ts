import type { Placement } from "@shared/edison";
import type { SavedGame, TimelinePoint } from "../game/types";

const PREFIX = "edison:";

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null; // unavailable (private mode) or corrupt: behave as empty
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// ---- anonymous client id ------------------------------------------------------
export function getClientId(): string {
  const existing = read("clientId");
  if (typeof existing === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const id = "c" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  write("clientId", id);
  return id;
}

// ---- preferences ----------------------------------------------------------------
export interface Preferences {
  showFreeHatch: boolean;
  showLabels: boolean;
  showDimensions: boolean;
  reduceMotion: "system" | "on" | "off";
  explorerSpeed: number;
}
export const DEFAULT_PREFS: Preferences = {
  showFreeHatch: true,
  showLabels: true,
  showDimensions: true,
  reduceMotion: "system",
  explorerSpeed: 30,
};
export function loadPrefs(): Preferences {
  const v = read("prefs");
  if (!isObj(v)) return { ...DEFAULT_PREFS };
  const p = { ...DEFAULT_PREFS };
  if (typeof v.showFreeHatch === "boolean") p.showFreeHatch = v.showFreeHatch;
  if (typeof v.showLabels === "boolean") p.showLabels = v.showLabels;
  if (typeof v.showDimensions === "boolean") p.showDimensions = v.showDimensions;
  if (v.reduceMotion === "system" || v.reduceMotion === "on" || v.reduceMotion === "off")
    p.reduceMotion = v.reduceMotion;
  if (typeof v.explorerSpeed === "number" && v.explorerSpeed > 0 && v.explorerSpeed <= 100_000)
    p.explorerSpeed = v.explorerSpeed;
  return p;
}
export const savePrefs = (p: Preferences) => write("prefs", p);

const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
function isPlacement(v: unknown): v is Placement {
  return (
    isObj(v) &&
    typeof v.pieceId === "string" &&
    fin(v.x) &&
    fin(v.y) &&
    fin(v.width) &&
    fin(v.height) &&
    typeof v.rotated === "boolean"
  );
}
function isTimelinePoint(v: unknown): v is TimelinePoint {
  return isObj(v) && fin(v.ms) && fin(v.covered) && fin(v.placed) && fin(v.actions);
}

// ---- in-progress game -----------------------------------------------------------
export function loadGame(puzzleId: string): SavedGame | null {
  const v = read(`game:${puzzleId}`);
  if (
    !isObj(v) ||
    v.version !== 1 ||
    v.puzzleId !== puzzleId ||
    !Array.isArray(v.placements) ||
    !isObj(v.stats)
  )
    return null;
  const count = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
  const s = v.stats;
  return {
    version: 1,
    puzzleId,
    placements: v.placements.filter(isPlacement),
    stats: {
      actions: count(s.actions),
      undos: count(s.undos),
      redos: count(s.redos),
      rotations: count(s.rotations),
    },
    elapsedMs: count(v.elapsedMs),
    timeline: Array.isArray(v.timeline) ? v.timeline.filter(isTimelinePoint) : [],
  };
}
export const saveGame = (g: SavedGame) => write(`game:${g.puzzleId}`, g);
export const clearGame = (puzzleId: string) => remove(`game:${puzzleId}`);

// ---- completed runs ---------------------------------------------------------------
export interface CompletedRun {
  id: string;
  puzzleId: string;
  finishedAt: string;
  timeMs: number;
  actions: number;
  undos: number;
  rotations: number;
  placements: Placement[];
  timeline: TimelinePoint[];
  challengeId: string | null;
}
const MAX_RUNS = 20;

function isRun(v: unknown): v is CompletedRun {
  return (
    isObj(v) &&
    typeof v.id === "string" &&
    typeof v.puzzleId === "string" &&
    fin(v.timeMs) &&
    fin(v.actions) &&
    fin(v.undos) &&
    fin(v.rotations) &&
    typeof v.finishedAt === "string" &&
    Array.isArray(v.placements) &&
    v.placements.every(isPlacement) &&
    Array.isArray(v.timeline) &&
    v.timeline.every(isTimelinePoint)
  );
}
export function loadRuns(puzzleId: string): CompletedRun[] {
  const v = read(`runs:${puzzleId}`);
  return Array.isArray(v) ? v.filter(isRun) : [];
}
export function addRun(run: CompletedRun): CompletedRun[] {
  const runs = [run, ...loadRuns(run.puzzleId).filter((r) => r.id !== run.id)].slice(0, MAX_RUNS);
  write(`runs:${run.puzzleId}`, runs);
  write("lastRun", { puzzleId: run.puzzleId, id: run.id });
  return runs;
}
export function loadLastRun(): CompletedRun | null {
  const v = read("lastRun");
  if (!isObj(v) || typeof v.puzzleId !== "string") return null;
  return loadRuns(v.puzzleId).find((r) => r.id === v.id) ?? null;
}
export function bestRun(runs: CompletedRun[]): CompletedRun | null {
  return runs.length ? runs.reduce((a, b) => (b.timeMs < a.timeMs ? b : a)) : null;
}

// ---- challenge progress cache (server is the source of truth when reachable) -------
export interface LocalChallengeProgress {
  passed: boolean;
  attempts: number;
  bestTimeMs: number | null;
  bestActions: number | null;
}
export function loadChallengeProgress(): Record<string, LocalChallengeProgress> {
  const v = read("challengeProgress");
  return isObj(v) ? (v as Record<string, LocalChallengeProgress>) : {};
}
export const saveChallengeProgress = (p: Record<string, LocalChallengeProgress>) =>
  write("challengeProgress", p);

/** Remove everything this app stored in the browser. */
export function clearAllLocalData(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
