import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ResultsPanel, type Verification } from "../components/Results";
import { EmptyState, ErrorState, Loading } from "../components/ui";
import { formatDuration } from "../lib/format";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { bestRun, loadLastRun, loadRuns, type CompletedRun } from "../lib/storage";

export function ResultsPage() {
  const { puzzleId } = useParams();
  useDocumentTitle("Results");
  const last = useMemo(() => (puzzleId ? null : loadLastRun()), [puzzleId]);
  const id = puzzleId ?? last?.puzzleId;
  const runs = useMemo(() => (id ? loadRuns(id) : []), [id]);
  const [pick, setPick] = useState<string | null>(null);
  const run: CompletedRun | null =
    runs.find((r) => r.id === pick) ?? (last && runs.find((r) => r.id === last.id)) ?? runs[0] ?? null;
  const runKey = run?.id;
  const puzzleQ = useAsync(() => (id ? api.puzzle(id) : Promise.reject(new Error("none"))), [id]);
  const [verification, setVerification] = useState<Verification>({ status: "pending" });

  useEffect(() => {
    if (!run) return;
    const current = run;
    let live = true;
    setVerification({ status: "pending" });
    api.validate(current.puzzleId, current.placements).then(
      (v) =>
        live &&
        setVerification(
          v.valid
            ? {
                status: "verified",
                response: { valid: true, validation: v, minimumActions: 0, attemptId: null, challenge: null },
              }
            : {
                status: "rejected",
                message: "The server no longer accepts this saved arrangement (the puzzle may have changed).",
              },
        ),
      () =>
        live &&
        setVerification({
          status: "offline",
          message: "Could not reach the server to re-check this result.",
        }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  if (!id || runs.length === 0 || !run) {
    return (
      <div>
        <div className="page-head">
          <div>
            <span className="eyebrow">Results</span>
            <h1>Your results</h1>
          </div>
        </div>
        <EmptyState
          title="No completed puzzles yet"
          action={
            <Link className="btn" to="/play">
              Start the puzzle
            </Link>
          }
        >
          Finish a puzzle and the result, with your time and moves, is kept here.
        </EmptyState>
      </div>
    );
  }
  if (puzzleQ.loading) return <Loading what="Loading results" />;
  if (puzzleQ.error || !puzzleQ.data) return <ErrorState error={puzzleQ.error} onRetry={puzzleQ.reload} />;
  const puzzle = puzzleQ.data;
  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Results</span>
          <h1>{puzzle.name}</h1>
          <p>
            {runs.length} completed {runs.length === 1 ? "run" : "runs"} saved in this browser.
          </p>
        </div>
        {runs.length > 1 && (
          <div style={{ minWidth: 260 }}>
            <label htmlFor="runpick">Run</label>
            <select id="runpick" value={run.id} onChange={(e) => setPick(e.target.value)}>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.finishedAt).toLocaleString()} · {formatDuration(r.timeMs)}
                  {r.id === bestRun(runs)?.id ? " · fastest" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <ResultsPanel puzzle={puzzle} run={run} verification={verification} showBoard onRetry={undefined} />
      <p style={{ marginTop: "var(--s-4)" }}>
        <Link className="btn" to={`/play/${puzzle.id}`}>
          Play again
        </Link>
      </p>
    </div>
  );
}
