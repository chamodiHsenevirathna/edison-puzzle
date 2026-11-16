import type { Board, Placement, Puzzle, Rectangle } from "@shared/edison";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PlacementCheck =
  { ok: true } | { ok: false; reason: "out_of_bounds" | "overlap"; blockedBy?: string };

/**
 * Can `candidate` go on the board next to `placements`?
 * A placement with the same pieceId as the candidate is ignored (moving/rotating a piece in place).
 */
export function checkPlacement(
  board: Board,
  placements: readonly Placement[],
  candidate: Rect & { pieceId: string },
): PlacementCheck {
  const { x, y, width, height } = candidate;
  if (x < 0 || y < 0 || x + width > board.width || y + height > board.height) {
    return { ok: false, reason: "out_of_bounds" };
  }
  for (const p of placements) {
    if (p.pieceId === candidate.pieceId) continue;
    if (x < p.x + p.width && p.x < x + width && y < p.y + p.height && p.y < y + height) {
      return { ok: false, reason: "overlap", blockedBy: p.pieceId };
    }
  }
  return { ok: true };
}

export function coveredArea(placements: readonly Placement[]): number {
  return placements.reduce((sum, p) => sum + p.width * p.height, 0);
}

/** Dimensions of a piece in the given orientation. */
export function orientedSize(rect: Rectangle, rotated: boolean): { width: number; height: number } {
  return rotated ? { width: rect.height, height: rect.width } : { width: rect.width, height: rect.height };
}

export function canRotate(puzzle: Pick<Puzzle, "allowRotation">, rect: Rectangle): boolean {
  return puzzle.allowRotation && rect.width !== rect.height;
}

/** A, B, ... Z, AA, AB ... (stable label for the n-th piece of a puzzle). */
export function pieceLabel(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function labelFor(puzzle: Pick<Puzzle, "pieces">, pieceId: string): string {
  const i = puzzle.pieces.findIndex((p) => p.id === pieceId);
  return i < 0 ? pieceId : pieceLabel(i);
}

/** Free (uncovered) cells by row-run, used for the hatch overlay. Returns rects, one per row-run. */
export function freeRuns(board: Board, placements: readonly Placement[]): Rect[] {
  const runs: Rect[] = [];
  for (let y = 0; y < board.height; y++) {
    const occupied = new Array<boolean>(board.width).fill(false);
    for (const p of placements) {
      if (y >= p.y && y < p.y + p.height) for (let x = p.x; x < p.x + p.width; x++) occupied[x] = true;
    }
    let start = -1;
    for (let x = 0; x <= board.width; x++) {
      const free = x < board.width && !occupied[x];
      if (free && start < 0) start = x;
      if (!free && start >= 0) {
        runs.push({ x: start, y, width: x - start, height: 1 });
        start = -1;
      }
    }
  }
  return runs;
}

/** Group vertically adjacent identical runs so the SVG has few rects. */
export function freeRects(board: Board, placements: readonly Placement[]): Rect[] {
  const out: Rect[] = [];
  const open = new Map<string, Rect>();
  const byRow = new Map<number, Rect[]>();
  for (const r of freeRuns(board, placements)) {
    const list = byRow.get(r.y) ?? [];
    list.push(r);
    byRow.set(r.y, list);
  }
  for (let y = 0; y <= board.height; y++) {
    const rowRuns = byRow.get(y) ?? [];
    const keys = new Set(rowRuns.map((r) => `${r.x}:${r.width}`));
    for (const [k, rect] of [...open]) {
      if (!keys.has(k)) {
        out.push(rect);
        open.delete(k);
      }
    }
    for (const r of rowRuns) {
      const k = `${r.x}:${r.width}`;
      const existing = open.get(k);
      if (existing) existing.height += 1;
      else open.set(k, { ...r });
    }
  }
  return out;
}
