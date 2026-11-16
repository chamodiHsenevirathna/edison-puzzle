import type { CompactSolverEvent, Placement, Puzzle } from "@shared/edison";
import { labelFor } from "../lib/geometry";
import type { ReplayState } from "./replay";

const dims = (p: Placement) => `${p.width} × ${p.height}`;

function overlapWith(p: Placement, placed: readonly Placement[]): Placement | undefined {
  return placed.find(
    (q) => p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height,
  );
}

/**
 * Plain-language explanation of one solver event. `before` is the state *before* the event,
 * which is what explains a rejection (what was already on the board).
 */
export function narrate(ev: CompactSolverEvent, puzzle: Puzzle, before: ReplayState): string {
  const L = (id: string) => labelFor(puzzle, id);
  switch (ev.type) {
    case "solver_started":
      return `Search started. The solver always fills the first free cell (top-most, then left-most), because some piece must have its top-left corner there.`;
    case "piece_selected":
      return `The first free cell is (${ev.x}, ${ev.y}). Piece ${L(ev.pieceId)} is chosen to cover it.`;
    case "placement_attempted":
      return `Trying piece ${L(ev.placement.pieceId)} as ${dims(ev.placement)}${ev.placement.rotated ? " (rotated)" : ""} with its top-left corner at (${ev.placement.x}, ${ev.placement.y}).`;
    case "placement_accepted": {
      const left = puzzle.pieces.length - (before.placements.length + 1);
      return `It fits. Piece ${L(ev.placement.pieceId)} is placed; ${left === 0 ? "no pieces remain" : `${left} ${left === 1 ? "piece remains" : "pieces remain"}`}.`;
    }
    case "placement_rejected": {
      if (ev.reason === "out_of_bounds") {
        return `Rejected: piece ${L(ev.placement.pieceId)} as ${dims(ev.placement)} would extend past the board edge.`;
      }
      const hit = overlapWith(ev.placement, before.placements);
      return `Rejected: piece ${L(ev.placement.pieceId)} as ${dims(ev.placement)} overlaps ${hit ? `piece ${L(hit.pieceId)}` : "a placed piece"}.`;
    }
    case "backtrack_started":
      return `Dead end. Nothing placed after piece ${L(ev.placement.pieceId)} can finish the board, so the solver takes it back.`;
    case "backtrack_completed":
      return `Piece ${L(ev.removed.pieceId)} is removed. The solver tries the next option for that cell.`;
    case "solution_found":
      return `Solution found: all ${puzzle.pieces.length} pieces are placed and the board is fully covered.`;
    case "search_completed": {
      const m: Record<string, string> = {
        exhausted: "The whole search space was explored.",
        max_solutions: "Search stopped at the requested number of solutions.",
        node_limit: "Search stopped: the server's node budget ran out.",
        time_limit: "Search stopped: the server's time budget ran out.",
        cancelled: "Search was cancelled.",
        event_limit: "Recording stopped: the event budget ran out before the search finished.",
        not_solvable: ev.message ?? "This puzzle cannot be solved.",
      };
      return m[ev.status] ?? `Search finished (${ev.status}).`;
    }
  }
}
