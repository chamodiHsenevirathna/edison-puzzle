import type { GallerySolution, SolutionsResponse } from "@shared/api";
import type { Puzzle } from "@shared/edison";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Board } from "../components/Board";
import { PuzzlePicker } from "../components/PuzzlePicker";
import { EmptyState, ErrorState, Loading, Notice, Panel } from "../components/ui";
import { formatInt } from "../lib/format";
import { labelFor } from "../lib/geometry";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { DEFAULT_PUZZLE } from "../lib/constants";

export function Gallery() {
  const { puzzleId = DEFAULT_PUZZLE } = useParams();
  const puzzleQ = useAsync(() => api.puzzle(puzzleId), [puzzleId]);
  const solQ = useAsync(() => api.solutions(puzzleId), [puzzleId]);
  useDocumentTitle("Solutions");
  if (puzzleQ.loading || solQ.loading) return <Loading what="Loading solutions" />;
  if (puzzleQ.error || !puzzleQ.data) return <ErrorState error={puzzleQ.error} onRetry={puzzleQ.reload} />;
  if (solQ.error || !solQ.data) return <ErrorState error={solQ.error} onRetry={solQ.reload} />;
  return <GalleryInner key={puzzleId} puzzle={puzzleQ.data} data={solQ.data} />;
}

const FAMILIES_SHOWN = 6;

function GalleryInner({ puzzle, data }: { puzzle: Puzzle; data: SolutionsResponse }) {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [shown, setShown] = useState(FAMILIES_SHOWN);
  const selected = data.solutions.find((s) => s.index === selectedIndex) ?? null;
  const byIndex = useMemo(() => new Map(data.solutions.map((s) => [s.index, s])), [data.solutions]);
  const sym = data.boardSymmetries;

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Solutions gallery</span>
          <h1>Valid arrangements</h1>
          <p>
            {data.count === 0 ? (
              "No solutions are stored for this puzzle yet."
            ) : (
              <>
                {data.exhaustive ? "An exhaustive search found" : "Found so far:"}{" "}
                <strong>{formatInt(data.count)}</strong> {data.count === 1 ? "arrangement" : "arrangements"}{" "}
                in <strong>{formatInt(data.familyCount)}</strong>{" "}
                {data.familyCount === 1 ? "solution family" : "solution families"}.
              </>
            )}
          </p>
        </div>
        <PuzzlePicker value={puzzle.id} onChange={(id) => navigate(`/solutions/${id}`)} />
      </div>

      {data.count === 0 ? (
        <EmptyState
          title="No solutions stored"
          action={
            <Link className="btn" to="/create">
              Open the creator to solve it
            </Link>
          }
        >
          Solutions appear here once the solver has found them. Use the Creator to run the solver on a custom
          puzzle and save what it finds.
        </EmptyState>
      ) : (
        <div className="workbench wide-side">
          <div className="stack">
            <Notice kind="info">
              <p>
                <strong>Rotations and reflections are not new solutions.</strong> This board can be turned and
                flipped in {sym} ways. Arrangements that match after such a turn belong to one family; they
                are the same puzzle answer seen from another side.
              </p>
              {puzzle.id === DEFAULT_PUZZLE && data.exhaustive && data.familyCount === 1 && (
                <p>
                  For the original puzzle the search found {data.count} arrangements and every one is a
                  rotation or reflection of a single arrangement. Identical pieces (two 21 × 18, two 21 × 14)
                  are interchangeable and are not counted as different.
                </p>
              )}
              {!data.exhaustive && <p>This list may be incomplete: the search was not run to the end.</p>}
            </Notice>

            {data.families.slice(0, shown).map((f) => (
              <section key={f.familyId} className="panel" aria-label={`Family ${f.familyId + 1}`}>
                <header>
                  <h2>Family {f.familyId + 1}</h2>
                  <span className="badge">
                    {f.members.length} {f.members.length === 1 ? "arrangement" : "arrangements"}
                  </span>
                </header>
                <div className="body">
                  <div
                    className="cards"
                    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))" }}
                  >
                    {f.members.map((m) => {
                      const s = byIndex.get(m.solutionIndex);
                      if (!s) return null;
                      return (
                        <article key={m.solutionIndex} className="card">
                          <div className="thumb">
                            <button
                              type="button"
                              className="thumb-btn"
                              aria-pressed={selectedIndex === s.index}
                              onClick={() => setSelectedIndex(s.index)}
                            >
                              <Board
                                board={puzzle.board}
                                puzzle={puzzle}
                                placements={s.placements}
                                showFree={false}
                                showDimensions={false}
                                thumbnail
                                ariaLabel={`Arrangement ${s.index + 1}: ${s.canonical ? "base arrangement" : s.transformLabel}`}
                              />
                            </button>
                          </div>
                          <div className="body" style={{ padding: "var(--s-2) var(--s-3)" }}>
                            <strong className="mono">#{s.index + 1}</strong>
                            <span className="muted" style={{ fontSize: "0.82rem" }}>
                              {s.canonical ? "Base arrangement" : s.transformLabel}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}
            {shown < data.families.length && (
              <button className="btn secondary" onClick={() => setShown(shown + FAMILIES_SHOWN)}>
                Show more families ({data.families.length - shown} more)
              </button>
            )}
          </div>

          <aside className="stack" aria-label="Selected arrangement">
            <Detail
              puzzle={puzzle}
              s={selected}
              base={
                selected
                  ? (byIndex.get(data.families[selected.familyId]?.canonicalIndex ?? -1) ?? null)
                  : null
              }
            />
          </aside>
        </div>
      )}
    </div>
  );
}

function Detail({
  puzzle,
  s,
  base,
}: {
  puzzle: Puzzle;
  s: GallerySolution | null;
  base: GallerySolution | null;
}) {
  if (!s)
    return (
      <Panel title="Inspect">
        <p className="muted" style={{ margin: 0 }}>
          Select an arrangement to see its pieces and how it relates to the base arrangement.
        </p>
      </Panel>
    );
  return (
    <Panel title={`Arrangement #${s.index + 1}`}>
      <div className="stack">
        <div className="board-wrap">
          <Board
            board={puzzle.board}
            puzzle={puzzle}
            placements={s.placements}
            showFree={false}
            showDimensions={false}
            ariaLabel={`Arrangement ${s.index + 1}`}
          />
        </div>
        <p style={{ margin: 0 }}>
          {s.canonical ? (
            <>
              This is the <strong>base arrangement</strong> of its family.
            </>
          ) : (
            <>
              This is arrangement #{(base?.index ?? 0) + 1} <strong>{s.transformLabel.toLowerCase()}</strong>.
            </>
          )}
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <caption className="sr-only">Pieces in arrangement {s.index + 1}</caption>
            <thead>
              <tr>
                <th scope="col">Piece</th>
                <th scope="col">Size</th>
                <th scope="col">Top-left</th>
                <th scope="col">Turned</th>
              </tr>
            </thead>
            <tbody>
              {[...s.placements]
                .sort((a, b) => a.y - b.y || a.x - b.x)
                .map((p) => (
                  <tr key={p.pieceId}>
                    <th scope="row">{labelFor(puzzle, p.pieceId)}</th>
                    <td>
                      {p.width} × {p.height}
                    </td>
                    <td>
                      ({p.x}, {p.y})
                    </td>
                    <td>{p.rotated ? "yes" : "no"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Link className="btn secondary" to={`/explore/${puzzle.id}`}>
          See how the solver finds one
        </Link>
      </div>
    </Panel>
  );
}
