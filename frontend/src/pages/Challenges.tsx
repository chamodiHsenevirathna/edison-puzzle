import type { Challenge, Difficulty } from "@shared/api";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { EmptyState, ErrorState, Loading, Notice, ProgressBar } from "../components/ui";
import { formatDuration } from "../lib/format";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { getClientId, loadChallengeProgress } from "../lib/storage";

const ORDER: Difficulty[] = ["easy", "medium", "hard", "expert"];
const LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" };

export function Challenges() {
  useDocumentTitle("Challenges");
  const list = useAsync(() => api.challenges(), []);
  const server = useAsync(() => api.progress(getClientId()).catch(() => null), []);
  const local = useMemo(() => loadChallengeProgress(), []);

  if (list.loading) return <Loading what="Loading challenges" />;
  if (list.error || !list.data) return <ErrorState error={list.error} onRetry={list.reload} />;
  const all = list.data.challenges;

  const status = (c: Challenge) => {
    const s = server.data?.challenges[c.id];
    const l = local[c.id];
    const passed = !!s?.passed || !!l?.passed;
    const attempts = Math.max(s?.attempts ?? 0, l?.attempts ?? 0);
    const times = [s?.bestTimeMs, l?.bestTimeMs].filter((v): v is number => typeof v === "number");
    const actions = [s?.bestActions, l?.bestActions].filter((v): v is number => typeof v === "number");
    return {
      passed,
      attempts,
      bestTimeMs: times.length ? Math.min(...times) : null,
      bestActions: actions.length ? Math.min(...actions) : null,
    };
  };
  const done = all.filter((c) => status(c).passed).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Challenges</span>
          <h1>Set yourself a constraint</h1>
          <p>
            Each challenge is a puzzle plus a limit taken from the puzzle&rsquo;s own rules: time, board
            actions, or undo. The arrangement is always checked by the server.
          </p>
        </div>
        <div style={{ minWidth: 220 }}>
          <label>
            {done} of {all.length} complete
          </label>
          <ProgressBar value={done} max={all.length} label="Challenges completed" />
        </div>
      </div>
      {!server.loading && server.data === null && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <Notice kind="warn">
            Couldn&rsquo;t load progress from the server; showing what this browser remembers.
          </Notice>
        </div>
      )}

      {all.length === 0 ? (
        <EmptyState title="No challenges available" />
      ) : (
        ORDER.map((d) => {
          const items = all.filter((c) => c.difficulty === d);
          if (!items.length) return null;
          return (
            <section key={d} aria-labelledby={`d-${d}`} style={{ marginBottom: "var(--s-6)" }}>
              <h2 id={`d-${d}`}>{LABEL[d]}</h2>
              <div className="cards">
                {items.map((c) => {
                  const st = status(c);
                  return (
                    <article key={c.id} className="card" aria-labelledby={`c-${c.id}`}>
                      <div className="body">
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <span className="badge">{LABEL[c.difficulty]}</span>
                          <span className={`badge ${st.passed ? "ok" : st.attempts ? "amber" : ""}`}>
                            {st.passed ? "Completed" : st.attempts ? "Attempted" : "Not started"}
                          </span>
                        </div>
                        <h3 id={`c-${c.id}`}>{c.title}</h3>
                        <p style={{ margin: 0 }}>
                          <strong>{c.objective}</strong>
                        </p>
                        <p className="muted" style={{ margin: 0, fontSize: "0.92rem" }}>
                          {c.description}
                        </p>
                        <ul className="row" style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
                          {c.constraints.maxActions != null && (
                            <li className="badge">≤ {c.constraints.maxActions} actions</li>
                          )}
                          {c.constraints.maxSeconds != null && (
                            <li className="badge">≤ {formatDuration(c.constraints.maxSeconds * 1000)}</li>
                          )}
                          {c.constraints.maxUndos === 0 && <li className="badge">no undo</li>}
                          {c.constraints.maxUndos != null && c.constraints.maxUndos > 0 && (
                            <li className="badge">≤ {c.constraints.maxUndos} undos</li>
                          )}
                        </ul>
                        {st.passed && (
                          <p className="mono" style={{ margin: 0, fontSize: "0.85rem" }}>
                            Best: {st.bestTimeMs !== null ? formatDuration(st.bestTimeMs) : "–"} ·{" "}
                            {st.bestActions ?? "–"} actions
                          </p>
                        )}
                      </div>
                      <footer>
                        <Link className="btn" to={`/play/${c.puzzleId}?challenge=${c.id}`}>
                          {st.passed ? "Play again" : st.attempts ? "Try again" : "Start"}
                        </Link>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
