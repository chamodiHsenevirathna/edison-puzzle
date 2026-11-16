import type { Placement, Puzzle } from "@shared/edison";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Board, type PieceMark } from "../components/Board";
import { PuzzlePicker } from "../components/PuzzlePicker";
import { EmptyState, ErrorState, Loading, Notice, Panel, ProgressBar, Stat, Stats } from "../components/ui";
import { narrate } from "../explorer/narrate";
import { useRecording } from "../explorer/useRecording";
import { formatInt, formatMs } from "../lib/format";
import { coveredArea, labelFor } from "../lib/geometry";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { DEFAULT_PUZZLE } from "../lib/constants";
import { usePrefs } from "../lib/prefs";

const SPEEDS = [1, 5, 20, 100, 500, 2000];

export function Explorer() {
  const { puzzleId = DEFAULT_PUZZLE } = useParams();
  const q = useAsync(() => api.puzzle(puzzleId), [puzzleId]);
  useDocumentTitle("Algorithm");
  if (q.loading) return <Loading what="Loading puzzle" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  return <ExplorerInner key={q.data.id} puzzle={q.data} />;
}

function ExplorerInner({ puzzle }: { puzzle: Puzzle }) {
  const navigate = useNavigate();
  const { prefs, update } = usePrefs();
  const rec = useRecording(puzzle.id);
  const { replay, status, done } = rec;
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const speed = SPEEDS.includes(prefs.explorerSpeed) ? prefs.explorerSpeed : 20;
  const total = replay.length;
  const idx = Math.min(index, total - 1);

  // reset the playhead when a new recording starts
  useEffect(() => {
    if (status === "recording" && total === 0) {
      setIndex(-1);
      setPlaying(false);
    }
  }, [status, total]);

  // playback loop: advances the playhead at `speed` events per second; pauses on solutions
  const latest = useRef({ total, status });
  latest.current = { total, status };
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (t: number) => {
      carry += ((t - last) / 1000) * speed;
      last = t;
      const steps = Math.floor(carry);
      if (steps > 0) {
        carry -= steps;
        setIndex((i) => {
          const max = latest.current.total - 1;
          let n = Math.min(max, i + steps);
          const sol = replay.find(i + 1, 1, (e) => e.type === "solution_found");
          if (sol !== -1 && sol <= n) {
            n = sol;
            setPlaying(false);
          } else if (n >= max && latest.current.status !== "recording") setPlaying(false);
          return n;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, replay]);

  const state = replay.stateAt(idx);
  const before = replay.stateAt(idx - 1);
  const ev = idx >= 0 ? replay.events[idx] : undefined;

  const candidate = useMemo(() => {
    if (!ev) return null;
    if (ev.type === "placement_attempted") return { placement: ev.placement, kind: "attempt" as const };
    if (ev.type === "placement_rejected") return { placement: ev.placement, kind: "rejected" as const };
    return null;
  }, [ev]);
  const marks: Record<string, PieceMark> = {};
  if (ev?.type === "placement_accepted") marks[ev.placement.pieceId] = "accepted";
  if (ev?.type === "backtrack_started") marks[ev.placement.pieceId] = "rejected";
  if (ev?.type === "solution_found") for (const p of state.placements) marks[p.pieceId] = "accepted";

  const covered = coveredArea(state.placements as Placement[]);
  const area = puzzle.board.width * puzzle.board.height;
  const canPlay = total > 0;
  const atEnd = idx >= total - 1 && status !== "recording";

  const jump = (dir: 1 | -1, pred: (e: NonNullable<typeof ev>) => boolean) => {
    const i = replay.find(idx + dir, dir, pred);
    if (i !== -1) setIndex(i);
  };

  const recent = useMemo(() => {
    const out: number[] = [];
    for (let i = Math.max(0, idx - 7); i <= idx; i++) out.push(i);
    return out.reverse();
  }, [idx]);

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Algorithm Explorer</span>
          <h1>Watch the solver work</h1>
          <p>
            Every step below is a real event recorded from the solver running on the server. Nothing is
            simulated.
          </p>
        </div>
        <PuzzlePicker value={puzzle.id} onChange={(id) => navigate(`/explore/${id}`)} />
      </div>

      {status === "error" && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <Notice kind="error">
            {rec.error}{" "}
            <button className="btn small secondary" onClick={rec.start}>
              Try again
            </button>
          </Notice>
        </div>
      )}

      <div className="workbench">
        <div className="stack">
          <div className="board-wrap">
            <Board
              board={puzzle.board}
              puzzle={puzzle}
              placements={state.placements as Placement[]}
              candidate={candidate}
              marks={marks}
              showFree={prefs.showFreeHatch}
              showLabels={prefs.showLabels}
              showDimensions={false}
              ariaLabel={`Solver board at event ${Math.max(0, idx + 1)} of ${total}: ${state.placements.length} pieces placed`}
            />
          </div>

          {!canPlay && status !== "recording" ? (
            <EmptyState
              title="Nothing recorded yet"
              action={
                <button className="btn" onClick={rec.start}>
                  Record the solver run
                </button>
              }
            >
              The solver will run once on the server (stopping at the first solution) and stream its events
              here. You can then step through them forwards and backwards.
            </EmptyState>
          ) : (
            <Panel title="Playback">
              <div className="stack">
                <div className="row">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setIndex(-1)}
                    disabled={!canPlay}
                    aria-label="Back to start"
                  >
                    ⏮
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setPlaying(false);
                      setIndex(Math.max(-1, idx - 1));
                    }}
                    disabled={!canPlay || idx < 0}
                  >
                    ◀ Step
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (atEnd) setIndex(-1);
                      setPlaying((p) => !p);
                    }}
                    disabled={!canPlay}
                  >
                    {playing ? "❚❚ Pause" : atEnd ? "↺ Replay" : "▶ Play"}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setPlaying(false);
                      setIndex(Math.min(total - 1, idx + 1));
                    }}
                    disabled={!canPlay || idx >= total - 1}
                  >
                    Step ▶
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setPlaying(false);
                      setIndex(total - 1);
                    }}
                    disabled={!canPlay}
                    aria-label="Jump to end"
                  >
                    ⏭
                  </button>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      setPlaying(false);
                      jump(-1, (e) => e.type === "placement_accepted" || e.type === "backtrack_completed");
                    }}
                    disabled={!canPlay}
                  >
                    ◀ Previous board change
                  </button>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      setPlaying(false);
                      jump(1, (e) => e.type === "placement_accepted" || e.type === "backtrack_completed");
                    }}
                    disabled={!canPlay}
                  >
                    Next board change ▶
                  </button>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      setPlaying(false);
                      jump(1, (e) => e.type === "backtrack_started");
                    }}
                    disabled={!canPlay}
                  >
                    Next dead end ▶
                  </button>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      setPlaying(false);
                      jump(1, (e) => e.type === "solution_found");
                    }}
                    disabled={!canPlay}
                  >
                    Solution ▶
                  </button>
                </div>
                <div>
                  <label htmlFor="scrub">
                    Position · event {formatInt(Math.max(0, idx + 1))} of {formatInt(total)}
                    {status === "recording" ? " (recording…)" : ""}
                  </label>
                  <input
                    id="scrub"
                    type="range"
                    min={-1}
                    max={Math.max(-1, total - 1)}
                    value={idx}
                    disabled={!canPlay}
                    onChange={(e) => {
                      setPlaying(false);
                      setIndex(Number(e.target.value));
                    }}
                    aria-valuetext={`Event ${Math.max(0, idx + 1)} of ${total}`}
                  />
                </div>
                <div>
                  <label htmlFor="speed">Speed</label>
                  <select
                    id="speed"
                    value={speed}
                    onChange={(e) => update({ explorerSpeed: Number(e.target.value) })}
                  >
                    {SPEEDS.map((s) => (
                      <option key={s} value={s}>
                        {formatInt(s)} events / second
                      </option>
                    ))}
                  </select>
                </div>
                {status === "recording" && (
                  <div className="row">
                    <span className="spinner" aria-hidden="true" />{" "}
                    <span>Receiving events from the solver…</span>{" "}
                    <button className="btn small danger" onClick={rec.cancel}>
                      Stop recording
                    </button>
                  </div>
                )}
                {status === "ready" && (
                  <div className="row">
                    <button className="btn small secondary" onClick={rec.start}>
                      Record again
                    </button>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>

        <aside className="stack" aria-label="Solver details">
          <Panel title="What just happened">
            <div aria-live="polite" role="status" style={{ minHeight: 72 }}>
              {ev ? (
                <p style={{ margin: 0 }}>
                  <span
                    className={`badge ${ev.type === "placement_rejected" ? "danger" : ev.type === "solution_found" ? "ok" : ""}`}
                  >
                    {ev.type.replace(/_/g, " ")}
                  </span>
                  <br />
                  {narrate(ev, puzzle, before)}
                </p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Press Play or Step to begin. The first event is the solver starting.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Progress at this point">
            <div className="stack">
              <ProgressBar value={covered} max={area} label="Board covered at this event" />
              <Stats>
                <Stat label="Board covered" value={`${Math.round((covered / area) * 100)}%`} />
                <Stat
                  label="Depth"
                  value={`${state.placements.length} / ${puzzle.pieces.length}`}
                  hint="placed"
                />
                <Stat label="Attempted" value={formatInt(state.attempted)} />
                <Stat label="Accepted" value={formatInt(state.accepted)} />
                <Stat label="Rejected" value={formatInt(state.rejected)} />
                <Stat label="Backtracks" value={formatInt(state.backtracks)} />
              </Stats>
            </div>
          </Panel>

          {done && (
            <Panel title="Whole run (from the solver)">
              <Stats>
                <Stat
                  label="Status"
                  value={<span style={{ fontSize: "0.95rem" }}>{done.status.replace(/_/g, " ")}</span>}
                />
                <Stat label="Search nodes" value={formatInt(done.metrics.nodesVisited)} />
                <Stat label="Placements tried" value={formatInt(done.metrics.placementsAttempted)} />
                <Stat label="Engine time" value={formatMs(done.metrics.elapsedMs)} />
              </Stats>
              <p className="muted" style={{ marginTop: 12, marginBottom: 0, fontSize: "0.9rem" }}>
                Engine time is the solver&rsquo;s own compute time on the server. It excludes network transfer
                and the playback you see here.
              </p>
              {done.truncated && (
                <Notice kind="warn">
                  Recording stopped at the event limit before the search finished, so playback ends early.
                </Notice>
              )}
              {done.status === "not_solvable" && (
                <Notice kind="info">{done.message ?? "This puzzle cannot be solved."}</Notice>
              )}
            </Panel>
          )}

          <Panel title="Recent events">
            {recent.length === 0 || idx < 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No events yet.
              </p>
            ) : (
              <ol className="log" aria-label="Recent solver events">
                {recent.map((i) => {
                  const e = replay.events[i];
                  if (!e) return null;
                  return (
                    <li
                      key={i}
                      className={`${i === idx ? "current" : ""} ${e.type === "placement_rejected" ? "rejected" : ""}`}
                    >
                      <span className="seq">#{formatInt(i + 1)}</span>
                      <span className="txt">{narrate(e, puzzle, replay.stateAt(i - 1))}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>

          <Panel title="How the solver decides">
            <p style={{ fontSize: "0.92rem" }}>
              It fills the board from the top-left. At each step it looks at the first empty cell (top-most,
              then left-most). Some piece must have its corner there, so it tries each unused piece, in both
              orientations. A try is rejected if it hangs off the board or overlaps a piece. If no piece fits,
              it backs up and changes an earlier choice.
            </p>
            <p style={{ fontSize: "0.92rem", marginBottom: 0 }}>
              Identical pieces are treated as one choice. Compare with your own approach on the{" "}
              <Link to={`/compare/${puzzle.id}`}>Compare</Link> page.
            </p>
          </Panel>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Pieces are lettered {labelFor(puzzle, puzzle.pieces[0]?.id ?? "")}–
            {labelFor(puzzle, puzzle.pieces[puzzle.pieces.length - 1]?.id ?? "")} in the order of the puzzle
            definition.
          </p>
        </aside>
      </div>
    </div>
  );
}
