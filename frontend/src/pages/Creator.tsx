import type { PuzzleAnalysis, PuzzleDetail, PuzzleInput, SolveResponse } from "@shared/api";
import type { Placement } from "@shared/edison";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Board } from "../components/Board";
import { EmptyState, ErrorState, Notice, Panel, Stat, Stats } from "../components/ui";
import { formatInt, formatMs } from "../lib/format";
import { pieceLabel } from "../lib/geometry";
import { useAsync, useDocumentTitle } from "../lib/hooks";

interface Row {
  key: number;
  w: string;
  h: string;
}
const num = (s: string): number => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);

export function Creator() {
  useDocumentTitle("Create a puzzle");
  const limits = useAsync(() => api.limits(), []);
  const puzzles = useAsync(() => api.puzzles(), []);
  const [name, setName] = useState("My puzzle");
  const [bw, setBw] = useState("12");
  const [bh, setBh] = useState("8");
  const [rotation, setRotation] = useState(true);
  const nextKey = useRef(4);
  const [rows, setRows] = useState<Row[]>([
    { key: 1, w: "6", h: "8" },
    { key: 2, w: "6", h: "4" },
    { key: 3, w: "6", h: "4" },
  ]);
  const [analysis, setAnalysis] = useState<PuzzleAnalysis | null>(null);
  const [analysisKey, setAnalysisKey] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [saved, setSaved] = useState<PuzzleDetail | null>(null);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const maxPieces = limits.data?.maxPieces ?? 30;

  const input: PuzzleInput = useMemo(
    () => ({
      name,
      board: { width: num(bw), height: num(bh) },
      allowRotation: rotation,
      pieces: rows.map((r) => ({ width: num(r.w), height: num(r.h) })),
    }),
    [name, bw, bh, rotation, rows],
  );

  // instant local numbers (the server's analysis stays authoritative)
  const piecesArea = rows.reduce(
    (s, r) => s + (Number.isNaN(num(r.w)) || Number.isNaN(num(r.h)) ? 0 : num(r.w) * num(r.h)),
    0,
  );
  const boardArea = Number.isNaN(num(bw)) || Number.isNaN(num(bh)) ? 0 : num(bw) * num(bh);

  // NaN is not valid JSON; send null so the server reports the field as invalid
  const body = useMemo(
    () =>
      JSON.parse(
        JSON.stringify(input, (_k, v) => (typeof v === "number" && Number.isNaN(v) ? null : v)),
      ) as PuzzleInput,
    [input],
  );
  const inputKey = useMemo(() => JSON.stringify(body), [body]);

  // server-side analysis, debounced; a response for an older definition is discarded
  useEffect(() => {
    setAnalysisError(null);
    let cancelled = false;
    const t = window.setTimeout(() => {
      api.analyze(body).then(
        (a) => {
          if (cancelled) return;
          setAnalysis(a);
          setAnalysisKey(inputKey);
        },
        (e: unknown) => {
          if (cancelled) return;
          setAnalysis(null);
          setAnalysisKey(null);
          setAnalysisError(e instanceof Error ? e.message : "Could not check the puzzle.");
        },
      );
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [body, inputKey]);

  const edits = useRef(0);
  const saveInFlight = useRef(false);
  const touch = () => {
    edits.current += 1;
    setSaved(null);
    setSaveError(null);
  };
  const setRow = (key: number, patch: Partial<Row>) => {
    touch();
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const save = useCallback(async () => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    const version = edits.current;
    setSaving(true);
    setSaveError(null);
    try {
      const created = await api.createPuzzle(body);
      puzzles.reload();
      if (edits.current === version) setSaved(created); // the form changed meanwhile: don't claim it was saved
    } catch (e) {
      if (edits.current === version)
        setSaveError(e instanceof ApiError ? e : new ApiError(0, "unknown", "Could not save the puzzle."));
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }, [body, puzzles]);

  const load = (p: PuzzleDetail) => {
    touch();
    setName(`${p.name} (copy)`.slice(0, 80));
    setBw(String(p.board.width));
    setBh(String(p.board.height));
    setRotation(p.allowRotation);
    setRows(p.pieces.map((r) => ({ key: nextKey.current++, w: String(r.width), h: String(r.height) })));
    window.scrollTo({ top: 0 });
  };

  const errors = analysis?.issues.filter((i) => i.severity === "error") ?? [];
  const others = analysis?.issues.filter((i) => i.severity !== "error") ?? [];
  const custom = (puzzles.data?.puzzles ?? []).filter((p) => !p.builtIn);
  const previewValid =
    Number(bw) > 0 &&
    Number(bh) > 0 &&
    Number(bw) <= (limits.data?.maxBoardSide ?? 100) &&
    Number(bh) <= (limits.data?.maxBoardSide ?? 100) &&
    /^\d+$/.test(bw) &&
    /^\d+$/.test(bh);

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Puzzle creator</span>
          <h1>Design your own packing puzzle</h1>
          <p>
            Choose a board and a set of rectangles. The server checks the puzzle, explains any problem, and
            stores it for you to play or solve.
          </p>
        </div>
      </div>

      <div className="workbench wide-side">
        <div className="stack">
          <Panel title="Board">
            <div
              className="grid-auto"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor={nameId}>Name</label>
                <input
                  id={nameId}
                  type="text"
                  maxLength={80}
                  value={name}
                  onChange={(e) => {
                    touch();
                    setName(e.target.value);
                  }}
                />
              </div>
              <div>
                <label htmlFor="bw">Width (cells)</label>
                <input
                  id="bw"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={limits.data?.maxBoardSide ?? 100}
                  value={bw}
                  aria-invalid={Number.isNaN(num(bw)) || num(bw) < 1}
                  onChange={(e) => {
                    touch();
                    setBw(e.target.value);
                  }}
                />
              </div>
              <div>
                <label htmlFor="bh">Height (cells)</label>
                <input
                  id="bh"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={limits.data?.maxBoardSide ?? 100}
                  value={bh}
                  aria-invalid={Number.isNaN(num(bh)) || num(bh) < 1}
                  onChange={(e) => {
                    touch();
                    setBh(e.target.value);
                  }}
                />
              </div>
              <div style={{ alignSelf: "end" }}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={rotation}
                    onChange={(e) => {
                      touch();
                      setRotation(e.target.checked);
                    }}
                  />{" "}
                  Allow rotation
                </label>
              </div>
            </div>
          </Panel>

          <Panel
            title={`Pieces · ${rows.length}`}
            actions={
              <button
                type="button"
                className="btn small secondary"
                disabled={rows.length >= maxPieces}
                onClick={() => {
                  touch();
                  setRows((rs) => [...rs, { key: nextKey.current++, w: "2", h: "2" }]);
                }}
              >
                + Add piece
              </button>
            }
          >
            <div className="pieces-editor">
              {rows.length === 0 && <p className="muted">No pieces yet. Add one to begin.</p>}
              {rows.map((r, i) => (
                <div className="piece-row" key={r.key} role="group" aria-label={`Piece ${pieceLabel(i)}`}>
                  <span className="idx" aria-hidden="true">
                    {pieceLabel(i)}
                  </span>
                  <div>
                    <label htmlFor={`w${r.key}`}>Width</label>
                    <input
                      id={`w${r.key}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={r.w}
                      aria-invalid={Number.isNaN(num(r.w)) || num(r.w) < 1}
                      onChange={(e) => setRow(r.key, { w: e.target.value })}
                    />
                  </div>
                  <span className="x" aria-hidden="true">
                    ×
                  </span>
                  <div>
                    <label htmlFor={`h${r.key}`}>Height</label>
                    <input
                      id={`h${r.key}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={r.h}
                      aria-invalid={Number.isNaN(num(r.h)) || num(r.h) < 1}
                      onChange={(e) => setRow(r.key, { h: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn small ghost"
                    aria-label={`Remove piece ${pieceLabel(i)}`}
                    onClick={() => {
                      touch();
                      setRows((rs) => rs.filter((x) => x.key !== r.key));
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <p className="muted" style={{ marginBottom: 0, fontSize: "0.9rem" }}>
              Up to {maxPieces} pieces. Identical pieces are interchangeable.
            </p>
          </Panel>

          <Panel title="Check">
            <div className="stack">
              <Stats>
                <Stat label="Pieces cover" value={formatInt(piecesArea)} hint="cells" />
                <Stat label="Board has" value={formatInt(boardArea)} hint="cells" />
                <Stat
                  label="Difference"
                  value={
                    boardArea === piecesArea
                      ? "0"
                      : `${piecesArea > boardArea ? "+" : "−"}${formatInt(Math.abs(piecesArea - boardArea))}`
                  }
                />
              </Stats>
              {analysisError && (
                <Notice kind="warn">{analysisError} The checks below may be out of date.</Notice>
              )}
              <div aria-live="polite">
                {errors.length > 0 && (
                  <Notice kind="error">
                    <strong>
                      {errors.length === 1
                        ? "This puzzle can’t be saved:"
                        : `This puzzle can’t be saved (${errors.length} problems):`}
                    </strong>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                      {errors.map((e, i) => (
                        <li key={i}>{e.message}</li>
                      ))}
                    </ul>
                  </Notice>
                )}
                {analysis && errors.length === 0 && (
                  <Notice kind="success">
                    The checks pass. The solver can tell you whether this puzzle can actually be tiled.
                  </Notice>
                )}
                {others.length > 0 && (
                  <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
                    {others.map((e, i) => (
                      <li key={i} className="muted">
                        {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {saveError && <Notice kind="error">{saveError.message}</Notice>}
              <div className="btn-group">
                <button
                  type="button"
                  className="btn"
                  onClick={save}
                  disabled={saving || !analysis?.canSave || analysisKey !== inputKey || !!saved}
                >
                  {saving ? "Saving…" : saved ? "Saved" : "Save puzzle"}
                </button>
              </div>
            </div>
          </Panel>

          {saved && <SavedPuzzle key={saved.id} puzzle={saved} />}
        </div>

        <aside className="stack" aria-label="Preview and saved puzzles">
          <Panel title="Preview">
            {previewValid ? (
              <div className="board-wrap">
                <Board
                  board={{ width: Number(bw), height: Number(bh) }}
                  puzzle={{ pieces: [] }}
                  placements={[]}
                  showFree={false}
                  showDimensions={false}
                  ariaLabel={`Empty ${bw} by ${bh} board`}
                />
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Enter a board width and height to see it here.
              </p>
            )}
          </Panel>
          <Panel title={`My puzzles · ${custom.length}`}>
            {puzzles.loading ? (
              <p className="muted">Loading…</p>
            ) : puzzles.error ? (
              <ErrorState error={puzzles.error} onRetry={puzzles.reload} />
            ) : custom.length === 0 ? (
              <EmptyState title="Nothing saved yet">
                Puzzles you save appear here and in the puzzle pickers across the app.
              </EmptyState>
            ) : (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {custom.map((p) => (
                  <MyPuzzle
                    key={p.id}
                    id={p.id}
                    name={p.name}
                    dims={`${p.board.width}×${p.board.height} · ${p.pieceCount} pieces`}
                    onLoad={load}
                    onDeleted={puzzles.reload}
                  />
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function MyPuzzle({
  id,
  name,
  dims,
  onLoad,
  onDeleted,
}: {
  id: string;
  name: string;
  dims: string;
  onLoad: (p: PuzzleDetail) => void;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <li className="panel" style={{ padding: "var(--s-3)" }}>
      <strong>{name}</strong>{" "}
      <span className="muted mono" style={{ fontSize: "0.82rem" }}>
        {dims}
      </span>
      <div className="btn-group" style={{ marginTop: 8 }}>
        <Link className="btn small" to={`/play/${id}`} aria-label={`Play ${name}`}>
          Play
        </Link>
        <button
          type="button"
          className="btn small secondary"
          aria-label={`Edit a copy of ${name}`}
          onClick={() => api.puzzle(id).then(onLoad, (e: Error) => setErr(e.message))}
        >
          Edit copy
        </button>
        {confirm ? (
          <>
            <button
              type="button"
              className="btn small danger"
              onClick={() =>
                api.deletePuzzle(id).then(onDeleted, (e: Error) => {
                  setErr(e.message);
                  setConfirm(false);
                })
              }
            >
              Confirm delete
            </button>
            <button type="button" className="btn small ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn small ghost"
            aria-label={`Delete ${name}`}
            onClick={() => setConfirm(true)}
          >
            Delete
          </button>
        )}
      </div>
      {err && <Notice kind="error">{err}</Notice>}
    </li>
  );
}

const STATUS_TEXT: Record<string, string> = {
  max_solutions: "Solved: the solver found a way to tile the board.",
  exhausted: "No solution exists. The solver tried every possibility and none fits.",
  node_limit:
    "Inconclusive: the solver hit its step limit before finishing. That does not prove there is no solution.",
  time_limit: "Inconclusive: the solver ran out of time. That does not prove there is no solution.",
  event_limit: "Inconclusive: the solver stopped early.",
  cancelled: "The run was cancelled.",
  not_solvable: "This puzzle cannot be solved.",
};

function SavedPuzzle({ puzzle }: { puzzle: PuzzleDetail }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SolveResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      setRes(await api.solve(puzzle.id, { maxSolutions: 1, timeLimitSeconds: 10, save: true }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The solver could not be run.");
    } finally {
      setBusy(false);
    }
  };
  const sol: Placement[] | undefined = res?.solutions[0]?.placements;
  return (
    <Panel title={`Saved · ${puzzle.name}`}>
      <div className="stack">
        <Notice kind="success" role="status">
          Saved. It is now available in every puzzle picker.
        </Notice>
        <div className="btn-group">
          <Link className="btn" to={`/play/${puzzle.id}`}>
            Play it
          </Link>
          <button type="button" className="btn secondary" onClick={run} disabled={busy}>
            {busy ? "Solving…" : "Ask the solver"}
          </button>
          <Link className="btn secondary" to={`/explore/${puzzle.id}`}>
            Watch the solver
          </Link>
        </div>
        {err && <Notice kind="error">{err}</Notice>}
        {res && (
          <div className="stack" aria-live="polite">
            <Notice
              kind={
                res.status === "max_solutions" ? "success" : res.status === "exhausted" ? "error" : "warn"
              }
            >
              {STATUS_TEXT[res.status] ?? res.status}
            </Notice>
            <Stats>
              <Stat label="Search nodes" value={formatInt(res.metrics.nodesVisited)} />
              <Stat label="Engine time" value={formatMs(res.metrics.elapsedMs)} />
            </Stats>
            {sol && (
              <div className="board-wrap">
                <Board
                  board={puzzle.board}
                  puzzle={puzzle}
                  placements={sol}
                  showFree={false}
                  showDimensions={false}
                  ariaLabel="Solver solution"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
