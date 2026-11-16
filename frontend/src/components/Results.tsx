import type { AttemptResponse, Challenge } from "@shared/api";
import type { Puzzle } from "@shared/edison";
import { Link } from "react-router-dom";
import { formatDuration, formatInt } from "../lib/format";
import type { CompletedRun } from "../lib/storage";
import { Board } from "./Board";
import { Notice, Stat, Stats } from "./ui";

export type Verification =
  | { status: "pending" }
  | { status: "verified"; response: AttemptResponse }
  | { status: "offline"; message: string }
  | { status: "rejected"; message: string };

interface Props {
  puzzle: Puzzle;
  run: CompletedRun;
  verification: Verification;
  challenge?: Challenge | null;
  onRetry?: () => void;
  onResubmit?: () => void;
  showBoard?: boolean;
}

export function ResultsPanel({
  puzzle,
  run,
  verification,
  challenge,
  onRetry,
  onResubmit,
  showBoard,
}: Props) {
  const min = puzzle.pieces.length;
  const result = verification.status === "verified" ? verification.response.challenge : null;
  return (
    <section className="stack" aria-labelledby="results-title">
      <div className="result-banner">
        <div>
          <span className="eyebrow">Complete</span>
          <h2 id="results-title">Puzzle solved in {formatDuration(run.timeMs)}</h2>
          <p style={{ margin: 0 }}>All {min} pieces are placed and the board is fully covered.</p>
        </div>
        <div className="btn-group">
          {onRetry && (
            <button type="button" className="btn" onClick={onRetry}>
              Try again
            </button>
          )}
          <Link className="btn secondary" to={`/explore/${puzzle.id}`}>
            Watch the algorithm
          </Link>
          <Link className="btn secondary" to={`/compare/${puzzle.id}`}>
            Compare with algorithm
          </Link>
        </div>
      </div>

      <Stats>
        <Stat label="Time" value={formatDuration(run.timeMs)} />
        <Stat label="Board actions" value={formatInt(run.actions)} hint={`min ${min}`} />
        <Stat label="Undos" value={formatInt(run.undos)} />
        <Stat label="Rotations" value={formatInt(run.rotations)} />
      </Stats>

      {verification.status === "pending" && (
        <Notice kind="info" role="status">
          Checking your arrangement with the server…
        </Notice>
      )}
      {verification.status === "verified" && (
        <Notice kind="success" role="status">
          The server independently checked this arrangement: every piece used once, nothing overlapping, board
          fully covered. Time and action counts are reported by this browser and are not verified.
        </Notice>
      )}
      {verification.status === "offline" && (
        <Notice kind="warn" role="status">
          <p>{verification.message} Your result is saved in this browser.</p>
          {onResubmit && (
            <button type="button" className="btn small secondary" onClick={onResubmit}>
              Retry verification
            </button>
          )}
        </Notice>
      )}
      {verification.status === "rejected" && <Notice kind="error">{verification.message}</Notice>}

      {challenge && (
        <section className="panel" aria-label="Challenge result">
          <header>
            <h3>Challenge · {challenge.title}</h3>
            {result && (
              <span className={`badge ${result.passed ? "ok" : "danger"}`}>
                {result.passed ? "Passed" : "Not met"}
              </span>
            )}
          </header>
          <div className="body">
            {result ? (
              <>
                <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {result.checks.map((c) => (
                    <li key={c.id}>
                      <span aria-hidden="true">{c.passed ? "✓" : "✗"}</span>{" "}
                      <span className="sr-only">{c.passed ? "Met: " : "Not met: "}</span>
                      {c.label}
                      {c.actual !== null && (
                        <span className="muted mono">
                          {" "}
                          ({c.actual}
                          {c.limit !== null ? ` / ${c.limit}` : ""})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p style={{ marginTop: 12 }}>{result.feedback}</p>
              </>
            ) : (
              <p className="muted">
                Challenge evaluation needs the server. It will appear once verification succeeds.
              </p>
            )}
            <Link className="btn secondary small" to="/challenges">
              All challenges
            </Link>
          </div>
        </section>
      )}

      {showBoard && (
        <div className="board-wrap">
          <Board
            board={puzzle.board}
            puzzle={puzzle}
            placements={run.placements}
            showFree={false}
            ariaLabel="Completed board"
          />
        </div>
      )}
    </section>
  );
}
