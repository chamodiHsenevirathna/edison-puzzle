import type { Board as BoardDims, Placement, Puzzle } from "@shared/edison";
import { useId, useMemo, type ReactElement } from "react";
import { freeRects, labelFor } from "../lib/geometry";

export type PieceMark = "selected" | "attempt" | "rejected" | "accepted" | "dim";

export interface Ghost {
  x: number;
  y: number;
  width: number;
  height: number;
  valid: boolean;
  label?: string;
}

export interface BoardProps {
  board: BoardDims;
  puzzle: Pick<Puzzle, "pieces">;
  placements: readonly Placement[];
  ghost?: Ghost | null;
  /** A candidate that is not on the board (Explorer attempts/rejections). */
  candidate?: { placement: Placement; kind: "attempt" | "rejected" } | null;
  marks?: Record<string, PieceMark>;
  cursor?: { x: number; y: number } | null;
  showFree?: boolean;
  showLabels?: boolean;
  showDimensions?: boolean;
  /** Pieces to draw dimension lines for (selected / hovered). */
  dimensionFor?: string | null;
  ariaLabel: string;
  interactive?: boolean;
  onCell?: (cell: { x: number; y: number } | null) => void;
  onActivate?: (cell: { x: number; y: number }, pieceId: string | null) => void;
  /** Small, label-free rendering for thumbnails. */
  thumbnail?: boolean;
}

function majorEvery(w: number): number {
  return w >= 40 ? 8 : w >= 16 ? 4 : 2;
}

/** Ruler stops every `major` cells, plus the far edge when it is not close to the last stop (odd sizes like 3 or 12). */
function rulerStops(len: number, major: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= len; i += major) out.push(i);
  const last = out[out.length - 1] as number;
  if (last !== len && len - last >= major / 2) out.push(len);
  return out;
}

export function pieceAt(placements: readonly Placement[], x: number, y: number): Placement | undefined {
  for (let i = placements.length - 1; i >= 0; i--) {
    const p = placements[i] as Placement;
    if (x >= p.x && x < p.x + p.width && y >= p.y && y < p.y + p.height) return p;
  }
  return undefined;
}

/** Client coordinates -> board cell, or null when outside the drawing. */
export function pointToCell(svg: SVGSVGElement, board: BoardDims, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM?.();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(ctm.inverse());
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= board.width || y >= board.height) return null;
  return { x, y };
}

export function Board(props: BoardProps) {
  const {
    board,
    puzzle,
    placements,
    ghost,
    candidate,
    marks,
    cursor,
    showFree = true,
    showLabels = true,
  } = props;
  const { showDimensions = true, dimensionFor, interactive, thumbnail } = props;
  const uid = useId().replace(/:/g, "");
  const W = board.width;
  const H = board.height;
  const k = Math.max(W, H) / 56; // annotation scale: keeps type/rulers proportionate on any board size
  const M = thumbnail ? 0.8 * k : 5.2 * k; // ruler band on top/left
  const R = thumbnail ? 0.8 * k : 1.6 * k;
  const major = majorEvery(Math.max(W, H));
  const free = useMemo(() => (showFree ? freeRects(board, placements) : []), [showFree, board, placements]);

  const lines: ReactElement[] = [];
  if (!thumbnail) {
    for (let i = 0; i <= W; i++) {
      const isMajor = i % major === 0;
      lines.push(
        <line
          key={`v${i}`}
          x1={i}
          y1={0}
          x2={i}
          y2={H}
          stroke="var(--cobalt)"
          strokeOpacity={isMajor ? 0.22 : 0.07}
          strokeWidth={isMajor ? 1 : 0.6}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
    for (let j = 0; j <= H; j++) {
      const isMajor = j % major === 0;
      lines.push(
        <line
          key={`h${j}`}
          x1={0}
          y1={j}
          x2={W}
          y2={j}
          stroke="var(--cobalt)"
          strokeOpacity={isMajor ? 0.22 : 0.07}
          strokeWidth={isMajor ? 1 : 0.6}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
  }

  const ticks: ReactElement[] = [];
  if (!thumbnail) {
    for (const i of rulerStops(W, major)) {
      ticks.push(
        <line
          key={`tx${i}`}
          x1={i}
          y1={-1.1 * k}
          x2={i}
          y2={0}
          stroke="var(--cobalt)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />,
      );
      ticks.push(
        <text key={`lx${i}`} x={i} y={-2.4 * k} fontSize={1.5 * k} className="ruler-text">
          {i}
        </text>,
      );
    }
    for (const j of rulerStops(H, major)) {
      ticks.push(
        <line
          key={`ty${j}`}
          x1={-1.1 * k}
          y1={j}
          x2={0}
          y2={j}
          stroke="var(--cobalt)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />,
      );
      ticks.push(
        <text key={`ly${j}`} x={-2.7 * k} y={j} fontSize={1.5 * k} className="ruler-text">
          {j}
        </text>,
      );
    }
  }

  const handle = (e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) =>
    pointToCell(e.currentTarget, board, e.clientX, e.clientY);

  const dimPiece = dimensionFor ? placements.find((p) => p.pieceId === dimensionFor) : undefined;

  return (
    <svg
      className={`board-svg${interactive ? " interactive" : ""}`}
      viewBox={`${-M} ${-M} ${W + M + R} ${H + M + R}`}
      role="img"
      aria-label={props.ariaLabel}
      onPointerMove={interactive ? (e) => props.onCell?.(handle(e)) : undefined}
      onPointerLeave={interactive ? () => props.onCell?.(null) : undefined}
      onClick={
        interactive
          ? (e) => {
              const cell = handle(e);
              if (cell) props.onActivate?.(cell, pieceAt(placements, cell.x, cell.y)?.pieceId ?? null);
            }
          : undefined
      }
    >
      <defs>
        <pattern
          id={`hatch-${uid}`}
          width={1.6 * k}
          height={1.6 * k}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2={1.6 * k}
            stroke="var(--cobalt)"
            strokeOpacity="0.2"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </pattern>
        <marker
          id={`arr-${uid}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,1 L9,5 L0,9" fill="none" stroke="var(--cobalt)" strokeWidth="1.4" />
        </marker>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="var(--white)" />
      {free.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={`url(#hatch-${uid})`} />
      ))}
      {lines}
      {ticks}
      {!thumbnail && (
        <g aria-hidden="true">
          <text x={W / 2} y={-4.3 * k} fontSize={1.3 * k} className="ruler-text">
            x →
          </text>
          <text
            x={-4.3 * k}
            y={H / 2}
            fontSize={1.3 * k}
            className="ruler-text"
            transform={`rotate(-90 ${-4.3 * k} ${H / 2})`}
          >
            y ↓
          </text>
        </g>
      )}
      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        fill="none"
        stroke="var(--cobalt)"
        strokeWidth={thumbnail ? 1 : 2}
        vectorEffect="non-scaling-stroke"
      />

      {placements.map((p) => {
        const mark = marks?.[p.pieceId];
        const label = labelFor(puzzle, p.pieceId);
        const fits = (p.width >= 5 * k && p.height >= 2.4 * k) || thumbnail;
        const text = thumbnail
          ? p.width >= 3 * k && p.height >= 3 * k && Math.max(W, H) <= 80
            ? label
            : ""
          : p.width >= 11 * k && p.height >= 3.6 * k
            ? `${label} · ${p.width}×${p.height}`
            : label;
        return (
          <g key={p.pieceId} className={`piece${mark ? ` ${mark}` : ""}`} data-piece={p.pieceId}>
            <rect className="body" x={p.x} y={p.y} width={p.width} height={p.height} />
            {showLabels && fits && text && (
              <text
                className="lbl"
                x={p.x + p.width / 2}
                y={p.y + p.height / 2}
                fontSize={(thumbnail ? 2.2 : 1.7) * k}
              >
                {text}
              </text>
            )}
          </g>
        );
      })}

      {candidate && (
        <g className={`piece ${candidate.kind}`} aria-hidden="true">
          <rect
            className="body"
            x={candidate.placement.x}
            y={candidate.placement.y}
            width={candidate.placement.width}
            height={candidate.placement.height}
            fillOpacity={0.85}
          />
          {candidate.kind === "rejected" && !thumbnail && (
            <>
              <line
                x1={candidate.placement.x}
                y1={candidate.placement.y}
                x2={candidate.placement.x + candidate.placement.width}
                y2={candidate.placement.y + candidate.placement.height}
                stroke="var(--danger)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={candidate.placement.x + candidate.placement.width}
                y1={candidate.placement.y}
                x2={candidate.placement.x}
                y2={candidate.placement.y + candidate.placement.height}
                stroke="var(--danger)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </g>
      )}

      {ghost && (
        <g className={`ghost${ghost.valid ? "" : " invalid"}`} aria-hidden="true">
          <rect x={ghost.x} y={ghost.y} width={ghost.width} height={ghost.height} />
          {ghost.label && (
            <text
              className="lbl"
              x={ghost.x + ghost.width / 2}
              y={ghost.y + ghost.height / 2}
              fontSize={1.7 * k}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fill: ghost.valid ? "var(--cobalt)" : "var(--danger)" }}
            >
              {ghost.label}
            </text>
          )}
        </g>
      )}

      {showDimensions && dimPiece && !thumbnail && <Dimensions p={dimPiece} k={k} markerId={`arr-${uid}`} />}

      {cursor && (
        <rect className="cursor-box" x={cursor.x} y={cursor.y} width={1} height={1} aria-hidden="true" />
      )}
    </svg>
  );
}

function Dimensions({ p, k, markerId }: { p: Placement; k: number; markerId: string }) {
  const off = 1.6 * k;
  const above = p.y - off > -2 * k;
  const hy = above ? p.y - off : p.y + p.height + off;
  const left = p.x - off > -2 * k;
  const vx = left ? p.x - off : p.x + p.width + off;
  return (
    <g aria-hidden="true">
      <line
        className="dim-line"
        x1={p.x}
        y1={hy}
        x2={p.x + p.width}
        y2={hy}
        markerStart={`url(#${markerId})`}
        markerEnd={`url(#${markerId})`}
      />
      <line
        className="dim-line"
        x1={p.x}
        y1={p.y}
        x2={p.x}
        y2={hy + (above ? -0.4 * k : 0.4 * k)}
        strokeOpacity={0.5}
      />
      <line
        className="dim-line"
        x1={p.x + p.width}
        y1={p.y}
        x2={p.x + p.width}
        y2={hy + (above ? -0.4 * k : 0.4 * k)}
        strokeOpacity={0.5}
      />
      <text
        className="dim-text"
        x={p.x + p.width / 2}
        y={hy + (above ? -1.2 * k : 1.2 * k)}
        fontSize={1.5 * k}
      >
        {p.width}
      </text>
      <line
        className="dim-line"
        x1={vx}
        y1={p.y}
        x2={vx}
        y2={p.y + p.height}
        markerStart={`url(#${markerId})`}
        markerEnd={`url(#${markerId})`}
      />
      <text
        className="dim-text"
        x={vx + (left ? -1.2 * k : 1.2 * k)}
        y={p.y + p.height / 2}
        fontSize={1.5 * k}
      >
        {p.height}
      </text>
    </g>
  );
}
