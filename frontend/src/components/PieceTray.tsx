import type { Placement, Puzzle, Rectangle } from "@shared/edison";
import { canRotate, labelFor, orientedSize } from "../lib/geometry";

interface Props {
  puzzle: Puzzle;
  placements: readonly Placement[];
  selectedId: string | null;
  trayRotated: Record<string, boolean>;
  onSelect: (id: string) => void;
  showPlaced?: boolean;
  /** Mouse only: lets the page start a drag from a tray piece. */
  onPointerDownPiece?: (id: string, e: React.PointerEvent<HTMLButtonElement>) => void;
}

function Glyph({ rect, rotated, label }: { rect: Rectangle; rotated: boolean; label: string }) {
  const { width, height } = orientedSize(rect, rotated);
  const pad = 2;
  return (
    <svg
      className="glyph"
      viewBox={`${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <rect x={0} y={0} width={width} height={height} />
      <text x={width / 2} y={height / 2} fontSize={Math.max(1, Math.min(width, height) * 0.5)}>
        {label}
      </text>
    </svg>
  );
}

/** The pieces still to place. Each is a real button: Tab to reach, Enter/Space to select. */
export function PieceTray({
  puzzle,
  placements,
  selectedId,
  trayRotated,
  onSelect,
  showPlaced,
  onPointerDownPiece,
}: Props) {
  const placed = new Set(placements.map((p) => p.pieceId));
  const items = puzzle.pieces.filter((r) => showPlaced || !placed.has(r.id));
  if (items.length === 0) return <p className="muted">All pieces are on the board.</p>;
  return (
    <div className="tray" role="group" aria-label="Pieces to place">
      {items.map((r) => {
        const rotated = !!trayRotated[r.id] && canRotate(puzzle, r);
        const { width, height } = orientedSize(r, rotated);
        const label = labelFor(puzzle, r.id);
        const isPlaced = placed.has(r.id);
        return (
          <button
            key={r.id}
            type="button"
            className={`tray-item${isPlaced ? " placed" : ""}`}
            aria-pressed={selectedId === r.id}
            disabled={isPlaced}
            onClick={() => onSelect(r.id)}
            onPointerDown={onPointerDownPiece ? (e) => onPointerDownPiece(r.id, e) : undefined}
          >
            <Glyph rect={r} rotated={rotated} label={label} />
            <span className="meta">
              <span>
                <span className="sr-only">Piece</span> {label}
              </span>{" "}
              <span>
                {width}×{height}
              </span>
            </span>
            {rotated && (
              <>
                {" "}
                <span className="sr-only">rotated</span>
              </>
            )}
            {isPlaced && (
              <>
                {" "}
                <span className="sr-only">placed</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
