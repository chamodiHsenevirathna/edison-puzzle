import type { GallerySolution } from "@shared/api";
import type { Placement } from "@shared/edison";

const key = (ps: readonly Placement[]) =>
  ps
    .map((p) => `${p.x},${p.y},${p.width},${p.height}`)
    .sort()
    .join("|");

/** Find the known solution whose geometry equals `placements` (identical pieces are interchangeable). */
export function matchSolution(
  placements: readonly Placement[],
  known: readonly GallerySolution[],
): GallerySolution | null {
  const k = key(placements);
  return known.find((s) => key(s.placements) === k) ?? null;
}
