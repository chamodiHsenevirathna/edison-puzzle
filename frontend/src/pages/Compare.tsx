import type { GallerySolution } from "@shared/api";
import type { Placement, Puzzle } from "@shared/edison";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Board } from "../components/Board";
import { ProgressChart, type Pt } from "../components/Chart";
import { PuzzlePicker } from "../components/PuzzlePicker";
import { EmptyState, ErrorState, Loading, Notice, Panel } from "../components/ui";
import { useRecording } from "../explorer/useRecording";
import { formatDuration, formatInt, formatMs } from "../lib/format";
import { coveredArea } from "../lib/geometry";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { matchSolution } from "../lib/match";
import { DEFAULT_PUZZLE } from "../lib/constants";
import { bestRun, loadRuns, type CompletedRun } from "../lib/storage";

export function Compare() {
  const { puzzleId = DEFAULT_PUZZLE } = useParams();
  const q = useAsync(() => api.puzzle(puzzleId), [puzzleId]);
  useDocumentTitle("Human vs algorithm");
  if (q.loading) return <Loading what="Loading puzzle" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  return <CompareInner key={q.data.id} puzzle={q.data} />;
}

function CompareInner({ puzzle }: { puzzle: Puzzle }) {
  const navigate = useNavigate();
  const runs = useMemo(() => loadRuns(puzzle.id), [puzzle.id]);
  const [runId, setRunId] = useState<string | null>(null);
  const human: CompletedRun | null = runs.find((r) => r.id === runId) ?? bestRun(runs);
  const rec = useRecording(puzzle.id);
  const known = useAsync(() => api.solutions(puzzle.id), [puzzle.id]);
  const area = puzzle.board.width * puzzle.board.height;

  // Everything about the algorithm below is derived from the recorded solver events.
  const algo = useMemo(() => {
    if (rec.status !== "ready" || !rec.done) return null;
    const pts: Pt[] = [{ x: 0, y: 0 }];
    let stack: Placement[] = [];
    let changes = 0;
    let solution: Placement[] | null = null;
    for (const e of rec.replay.events) {
      if (e.type === "placement_accepted") {
        stack = [...stack, e.placement];
        pts.push({ x: ++changes, y: (coveredArea(stack) / area) * 100 });
      } else if (e.type === "backtrack_completed") {
        stack = stack.slice(0, -1);
        pts.push({ x: ++changes, y: (coveredArea(stack) / area) * 100 });
      } else if (e.type === "solution_found" && !solution) solution = [...e.solution.placements];
    }
    return { pts, changes, solution, done: rec.done };
  }, [rec.status, rec.done, rec.replay, area]);

  const humanPts: Pt[] = human
    ? [
        { x: 0, y: 0 },
        ...human.timeline
          .filter((t) => t.actions > 0)
          .map((t) => ({ x: t.actions, y: (t.covered / area) * 100 })),
      ]
    : [];
  const match: GallerySolution | null =
    human && known.data ? matchSolution(human.placements, known.data.solutions) : null;
  const algoMatch: GallerySolution | null =
    algo?.solution && known.data ? matchSolution(algo.solution, known.data.solutions) : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Human vs algorithm</span>
          <h1>You and the solver, side by side</h1>
          <p>Same board, same rules. The numbers below say exactly what they measure.</p>
        </div>
        <PuzzlePicker value={puzzle.id} onChange={(id) => navigate(`/compare/${id}`)} />
      </div>

      <div
        className="grid-auto"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))" }}
      >
        <Panel title="You">
          {!human ? (
            <EmptyState
              title="No completed run yet"
              action={
                <Link className="btn" to={`/play/${puzzle.id}`}>
                  Solve the puzzle
                </Link>
              }
            >
              Finish this puzzle once and your run appears here.
            </EmptyState>
          ) : (
            <div className="stack">
              {runs.length > 1 && (
                <div>
                  <label htmlFor="run">Run</label>
                  <select id="run" value={human.id} onChange={(e) => setRunId(e.target.value)}>
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {new Date(r.finishedAt).toLocaleString()} · {formatDuration(r.timeMs)}
                        {r.id === bestRun(runs)?.id ? " · fastest" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="board-wrap">
                <Board
                  board={puzzle.board}
                  puzzle={puzzle}
                  placements={human.placements}
                  showFree={false}
                  showDimensions={false}
                  ariaLabel="Your final board"
                />
              </div>
              <ProgressChart
                points={humanPts}
                xLabel="board actions"
                color="var(--cobalt)"
                label="Your board coverage over your actions"
              />
            </div>
          )}
        </Panel>

        <Panel title="Algorithm">
          {(rec.status === "idle" || (rec.status === "ready" && !rec.done)) && (
            <EmptyState
              title="Run the solver"
              action={
                <button className="btn" onClick={rec.start}>
                  Run the solver
                </button>
              }
            >
              The solver runs on the server and streams its real events; nothing here is pre-computed.
            </EmptyState>
          )}
          {rec.status === "recording" && (
            <div className="state-box" role="status">
              <span className="spinner" aria-hidden="true" />
              <p>Solver running… {formatInt(rec.replay.length)} events received</p>
              <button className="btn small danger" onClick={rec.cancel}>
                Stop
              </button>
            </div>
          )}
          {rec.status === "error" && (
            <Notice kind="error">
              {rec.error}{" "}
              <button className="btn small secondary" onClick={rec.start}>
                Try again
              </button>
            </Notice>
          )}
          {algo && (
            <div className="stack">
              {algo.solution ? (
                <div className="board-wrap">
                  <Board
                    board={puzzle.board}
                    puzzle={puzzle}
                    placements={algo.solution}
                    showFree={false}
                    showDimensions={false}
                    ariaLabel="The algorithm's solution"
                  />
                </div>
              ) : (
                <Notice kind="warn">
                  The solver stopped ({algo.done.status.replace(/_/g, " ")}) without finding a solution
                  {algo.done.truncated ? ": recording hit the event limit" : ""}.
                </Notice>
              )}
              <ProgressChart
                points={algo.pts}
                xLabel="board changes (placements + takebacks)"
                color="var(--amber-line)"
                label="Algorithm board coverage over its board changes"
              />
              <Link className="btn secondary" to={`/explore/${puzzle.id}`}>
                Step through this run
              </Link>
            </div>
          )}
        </Panel>
      </div>

      {human && algo && (
        <div className="stack" style={{ marginTop: "var(--s-5)" }}>
          <Panel title="Metrics">
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    <th scope="col">You</th>
                    <th scope="col">Algorithm</th>
                    <th scope="col">What it means</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Time</th>
                    <td>{formatDuration(human.timeMs)}</td>
                    <td>{formatMs(algo.done.metrics.elapsedMs)}</td>
                    <td>
                      Yours: active time from your first action to the last piece. Algorithm: the
                      solver&rsquo;s compute time on the server, excluding network and playback.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Board changes</th>
                    <td>{formatInt(human.actions)}</td>
                    <td>{formatInt(algo.changes)}</td>
                    <td>
                      Yours: place, move, rotate or remove. Algorithm: each accepted placement plus each piece
                      it takes back.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Moves taken back</th>
                    <td>{formatInt(human.undos)}</td>
                    <td>{formatInt(algo.done.metrics.backtracks)}</td>
                    <td>Your undos versus the solver&rsquo;s backtracks.</td>
                  </tr>
                  <tr>
                    <th scope="row">Options evaluated</th>
                    <td>n/a</td>
                    <td>{formatInt(algo.done.metrics.placementsAttempted)}</td>
                    <td>
                      Placements the solver tried (accepted {formatInt(algo.done.metrics.placementsAccepted)},
                      rejected {formatInt(algo.done.metrics.placementsRejected)}). Your own mental search is
                      not measurable.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Minimum possible changes</th>
                    <td colSpan={2}>{puzzle.pieces.length}</td>
                    <td>One placement per piece.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Final solutions">
            {match && algoMatch ? (
              <p style={{ margin: 0 }}>
                {match.familyId === algoMatch.familyId ? (
                  <>
                    Both boards are the <strong>same underlying solution</strong>
                    {match.index === algoMatch.index ? (
                      ", in the same orientation"
                    ) : (
                      <>
                        , in a different orientation (arrangement {match.index + 1} versus{" "}
                        {algoMatch.index + 1} in the <Link to={`/solutions/${puzzle.id}`}>gallery</Link>)
                      </>
                    )}
                    .
                  </>
                ) : (
                  <>
                    The two boards belong to <strong>different solution families</strong>.
                  </>
                )}
              </p>
            ) : (
              <p style={{ margin: 0 }} className="muted">
                {known.loading
                  ? "Checking the solution list…"
                  : "Could not match these boards against the saved solution list for this puzzle."}
              </p>
            )}
          </Panel>

          <Notice kind="info">
            <strong>Is this comparison fair?</strong> Not in every respect, and it doesn&rsquo;t claim to be.
            The solver tries options mechanically and never gets tired; you look at the picture. Time is
            wall-clock for you and compute-only for the solver. The most comparable measures are the number of
            board changes and the number of moves taken back. Your time and action counts come from this
            browser.
          </Notice>
        </div>
      )}
    </div>
  );
}
