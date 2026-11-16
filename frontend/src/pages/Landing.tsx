import { Link } from "react-router-dom";
import { useDocumentTitle } from "../lib/hooks";
import { ORIGINAL_BOARD, ORIGINAL_PIECES } from "../lib/original";
import { pieceLabel } from "../lib/geometry";

/** Exploded view of the twelve pieces on a drawing sheet, shelf-packed and dimensioned. */
function PieceSheet() {
  const gap = 5,
    maxRow = 74;
  let x = 0,
    y = 0,
    rowH = 0;
  const items = ORIGINAL_PIECES.map(([w0, h0], i) => {
    const w = Math.max(w0, h0),
      h = Math.min(w0, h0); // draw landscape for a tidy sheet
    if (x + w > maxRow) {
      x = 0;
      y += rowH + gap + 4;
      rowH = 0;
    }
    const it = { i, w, h, x, y, w0, h0 };
    x += w + gap;
    rowH = Math.max(rowH, h);
    return it;
  });
  const H = y + rowH + 2;
  return (
    <svg
      viewBox={`-2 -2 ${maxRow + 4} ${H + 4}`}
      role="img"
      aria-label={`The twelve pieces, shown separately: ${ORIGINAL_PIECES.map((p) => `${p[0]} by ${p[1]}`).join(", ")}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <pattern id="sheet-grid" width="2" height="2" patternUnits="userSpaceOnUse">
          <path d="M2 0H0V2" fill="none" stroke="#0b3ba8" strokeOpacity="0.1" strokeWidth="0.15" />
        </pattern>
      </defs>
      <rect x={-2} y={-2} width={maxRow + 4} height={H + 4} fill="url(#sheet-grid)" />
      {items.map((it) => (
        <g key={it.i}>
          <rect
            x={it.x}
            y={it.y}
            width={it.w}
            height={it.h}
            fill="#f8dfae"
            stroke="#0b3ba8"
            strokeWidth={0.5}
          />
          <text
            x={it.x + it.w / 2}
            y={it.y + it.h / 2}
            fontSize={Math.min(3.2, it.h * 0.55)}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#6b4204"
            fontFamily="IBM Plex Mono, monospace"
            fontWeight={500}
          >
            {pieceLabel(it.i)}
          </text>
          <text
            x={it.x + it.w / 2}
            y={it.y + it.h + 2.3}
            fontSize={1.9}
            textAnchor="middle"
            fill="#0b3ba8"
            fontFamily="IBM Plex Mono, monospace"
          >
            {it.w0} × {it.h0}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Landing() {
  useDocumentTitle("");
  const total = ORIGINAL_PIECES.reduce((s, [w, h]) => s + w * h, 0);
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div>
          <span className="eyebrow">A rectangle-packing puzzle</span>
          <h1 id="hero-title">
            Twelve rectangles. One {ORIGINAL_BOARD} × {ORIGINAL_BOARD} board.
          </h1>
          <p className="lead">
            Fit every piece onto the board with no gaps and no overlaps. Rotate them if you need to. Then
            watch a solver do it, and see how it compares.
          </p>
          <div className="btn-group">
            <Link className="btn" to="/play/edison-original">
              Start the puzzle
            </Link>
            <Link className="btn secondary" to="/explore/edison-original">
              Watch the algorithm
            </Link>
          </div>
        </div>
        <figure className="hero-figure" style={{ margin: 0 }}>
          <PieceSheet />
          <figcaption className="muted mono" style={{ fontSize: "0.78rem", marginTop: 8 }}>
            FIG. 1 · THE TWELVE PIECES, SEPARATED. DIMENSIONS IN CELLS.
          </figcaption>
        </figure>
      </section>

      <section className="section" aria-labelledby="obj">
        <h2 id="obj">
          <span className="no">01</span> The objective
        </h2>
        <p>
          The board is {ORIGINAL_BOARD} × {ORIGINAL_BOARD} = {(ORIGINAL_BOARD ** 2).toLocaleString("en-US")}{" "}
          cells. The twelve pieces together cover exactly {total.toLocaleString("en-US")} cells. So the job is
          an exact tiling: every piece used once, the whole board covered, nothing left over.
        </p>
        <table className="table" style={{ maxWidth: 560 }}>
          <caption className="sr-only">The twelve pieces</caption>
          <thead>
            <tr>
              <th scope="col">Piece</th>
              <th scope="col">Size</th>
              <th scope="col">Cells</th>
            </tr>
          </thead>
          <tbody>
            {ORIGINAL_PIECES.map(([w, h], i) => (
              <tr key={i}>
                <th scope="row">{pieceLabel(i)}</th>
                <td>
                  {w} × {h}
                </td>
                <td>{w * h}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Total</th>
              <td>12 pieces</td>
              <td>{total.toLocaleString("en-US")}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="section" aria-labelledby="how">
        <h2 id="how">
          <span className="no">02</span> How to play
        </h2>
        <ol className="steps">
          <li>
            <strong>Choose a piece</strong> from the tray by clicking, tapping or pressing Enter.
          </li>
          <li>
            <strong>Rotate it</strong> with the R key or the Rotate button, if you want.
          </li>
          <li>
            <strong>Place it</strong> by clicking the board. A dashed outline shows where it will land, and
            turns red when it can&rsquo;t.
          </li>
          <li>
            <strong>Change your mind.</strong> Select a placed piece to move, rotate or remove it. Undo and
            redo are always available.
          </li>
        </ol>
        <p style={{ marginTop: 16 }}>
          <Link className="btn" to="/play/edison-original">
            Open the puzzle
          </Link>
        </p>
      </section>

      <section className="section" aria-labelledby="explore">
        <h2 id="explore">
          <span className="no">03</span> Explore the algorithm
        </h2>
        <p>
          The solver always fills the first empty cell, trying each piece in each orientation and backing up
          when it hits a dead end. In the Algorithm Explorer you can step through the real events it produces,
          forward and back, at any speed.
        </p>
        <div className="cards">
          <Link
            className="card"
            to="/explore/edison-original"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="body">
              <h3>Algorithm</h3>
              <p className="muted" style={{ margin: 0 }}>
                Step through every placement, rejection and backtrack.
              </p>
            </div>
          </Link>
          <Link
            className="card"
            to="/compare/edison-original"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="body">
              <h3>Human vs algorithm</h3>
              <p className="muted" style={{ margin: 0 }}>
                Your run beside the solver&rsquo;s, with the measures defined.
              </p>
            </div>
          </Link>
          <Link
            className="card"
            to="/solutions/edison-original"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="body">
              <h3>Solutions</h3>
              <p className="muted" style={{ margin: 0 }}>
                Every arrangement, grouped by rotation and reflection.
              </p>
            </div>
          </Link>
          <Link className="card" to="/challenges" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="body">
              <h3>Challenges</h3>
              <p className="muted" style={{ margin: 0 }}>
                Time limits, move limits and no-undo runs.
              </p>
            </div>
          </Link>
          <Link className="card" to="/create" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="body">
              <h3>Create</h3>
              <p className="muted" style={{ margin: 0 }}>
                Design your own board and pieces, and ask the solver.
              </p>
            </div>
          </Link>
        </div>
      </section>

      <section className="section" aria-labelledby="finding">
        <h2 id="finding">
          <span className="no">04</span> What an exhaustive search found
        </h2>
        <p>
          This project&rsquo;s solver searched the whole space for the original puzzle (rotation allowed,
          identical pieces counted as interchangeable). It found <strong>eight arrangements</strong>. All
          eight are the same arrangement turned or flipped, so the puzzle has{" "}
          <strong>one solution up to rotation and reflection</strong>.
        </p>
        <p>
          <Link to="/solutions/edison-original">See all eight and how they relate →</Link>
        </p>
      </section>
    </>
  );
}
