export interface Pt {
  x: number;
  y: number;
}

/** Minimal line chart: y is 0..100 (% of board covered), x is a count. */
export function ProgressChart({
  points,
  xLabel,
  color,
  label,
}: {
  points: Pt[];
  xLabel: string;
  color: string;
  label: string;
}) {
  const W = 420,
    H = 150,
    L = 34,
    B = 26,
    T = 8,
    R = 8;
  const maxX = Math.max(1, ...points.map((p) => p.x));
  const sx = (x: number) => L + (x / maxX) * (W - L - R);
  const sy = (y: number) => T + (1 - y / 100) * (H - T - B);
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--cobalt)" strokeOpacity={0.15} />
          <text x={L - 6} y={sy(v)} textAnchor="end" dominantBaseline="central">
            {v}%
          </text>
        </g>
      ))}
      <line x1={L} x2={L} y1={T} y2={H - B} stroke="var(--cobalt)" strokeOpacity={0.4} />
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--cobalt)" strokeOpacity={0.4} />
      <text x={L} y={H - 8}>
        0
      </text>
      <text x={W - R} y={H - 8} textAnchor="end">
        {maxX.toLocaleString("en-US")}
      </text>
      <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle">
        {xLabel}
      </text>
      {points.length > 1 && (
        <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      )}
    </svg>
  );
}
