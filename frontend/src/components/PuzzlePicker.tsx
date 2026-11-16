import { useId } from "react";
import { api } from "../api/client";
import { useAsync } from "../lib/hooks";

export function PuzzlePicker({
  value,
  onChange,
  label = "Puzzle",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const id = useId();
  const list = useAsync(() => api.puzzles(), []);
  const puzzles = list.data?.puzzles ?? [];
  return (
    <div style={{ minWidth: 220 }}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={list.loading && !puzzles.length}
      >
        {!puzzles.some((p) => p.id === value) && <option value={value}>{value}</option>}
        {puzzles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.board.width}×{p.board.height}
            {p.builtIn ? "" : " (custom)"}
          </option>
        ))}
      </select>
    </div>
  );
}
