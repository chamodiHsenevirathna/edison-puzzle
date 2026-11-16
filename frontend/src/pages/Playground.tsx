import type { Challenge } from "@shared/api";
import type { Puzzle } from "@shared/edison";
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { DEFAULT_PUZZLE } from "../lib/constants";
import { Board, pieceAt, type Ghost, type PieceMark } from "../components/Board";
import { PieceTray } from "../components/PieceTray";
import { PuzzlePicker } from "../components/PuzzlePicker";
import { ResultsPanel, type Verification } from "../components/Results";
import { EmptyState, ErrorState, Loading, Notice, Panel, ProgressBar, Stat, Stats } from "../components/ui";
import { elapsedMs, initialState, reducer, toSaved, unplacedPieces } from "../game/reducer";
import type { GameState } from "../game/types";
import { formatDuration, formatInt } from "../lib/format";
import { canRotate, checkPlacement, coveredArea, labelFor, orientedSize } from "../lib/geometry";
import { useAsync, useDocumentTitle, useNow } from "../lib/hooks";
import { usePrefs } from "../lib/prefs";
import {
  addRun,
  clearGame,
  getClientId,
  loadChallengeProgress,
  loadGame,
  saveChallengeProgress,
  saveGame,
  type CompletedRun,
} from "../lib/storage";

export function Playground() {
  const { puzzleId = DEFAULT_PUZZLE } = useParams();
  const navigate = useNavigate();
  const q = useAsync(() => api.puzzle(puzzleId), [puzzleId]);
  const [search] = useSearchParams();
  const challengeId = search.get("challenge");
  const challenges = useAsync(() => (challengeId ? api.challenges() : Promise.resolve(null)), [challengeId]);
  useDocumentTitle(q.data ? `Play · ${q.data.name}` : "Play");

  if (q.loading || (challengeId && challenges.loading)) return <Loading what="Loading puzzle" />;
  if (q.error || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return notFound ? (
      <EmptyState
        title="Puzzle not found"
        action={
          <button className="btn" onClick={() => navigate(`/play/${DEFAULT_PUZZLE}`)}>
            Open the original puzzle
          </button>
        }
      >
        There is no puzzle with the id “{puzzleId}”. It may have been deleted.
      </EmptyState>
    ) : (
      <ErrorState error={q.error} onRetry={q.reload} />
    );
  }
  const challenge = challengeId
    ? (challenges.data?.challenges.find((c) => c.id === challengeId) ?? null)
    : null;
  return <PlaygroundInner key={`${q.data.id}:${challengeId ?? ""}`} puzzle={q.data} challenge={challenge} />;
}

function anchor(
  cell: { x: number; y: number },
  size: { width: number; height: number },
  board: Puzzle["board"],
) {
  const x = Math.max(0, Math.min(board.width - size.width, cell.x - Math.floor(size.width / 2)));
  const y = Math.max(0, Math.min(board.height - size.height, cell.y - Math.floor(size.height / 2)));
  return { x, y };
}

function PlaygroundInner({ puzzle, challenge }: { puzzle: Puzzle; challenge: Challenge | null }) {
  const navigate = useNavigate();
  const { prefs } = usePrefs();
  const inChallenge = challenge !== null;
  const [state, dispatch] = useReducer(reducer, puzzle, (p) => {
    const base = initialState(p);
    const saved = inChallenge ? null : loadGame(p.id);
    return saved ? reducer(base, { type: "restore", saved }) : base;
  });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const running = state.clock.runningSince !== null && state.completedMs === null;
  const now = useNow(running);
  const elapsed = elapsedMs(state, now);
  const board = puzzle.board;
  const total = board.width * board.height;
  const covered = coveredArea(state.placements);
  const act = useCallback((a: Parameters<typeof dispatch>[0]) => dispatch(a), []);

  // ---- persistence (free play only; challenge attempts always start fresh) ----
  useEffect(() => {
    if (inChallenge || state.completedMs !== null) return;
    if (state.placements.length === 0 && state.stats.actions === 0) return;
    saveGame(toSaved(state, Date.now()));
  }, [state.placements, state.stats, state.completedMs, inChallenge, state]);

  // ---- completion: record the run locally, then have the server verify it ----
  const [run, setRun] = useState<CompletedRun | null>(null);
  const [verification, setVerification] = useState<Verification>({ status: "pending" });
  const submitSeq = useRef(0); // a late answer for a discarded run must not overwrite the current one
  const submit = useCallback(
    async (r: CompletedRun) => {
      const mine = ++submitSeq.current;
      const current = () => submitSeq.current === mine;
      setVerification({ status: "pending" });
      try {
        const res = await api.submitAttempt({
          clientId: getClientId(),
          puzzleId: puzzle.id,
          challengeId: r.challengeId,
          placements: r.placements,
          timeMs: r.timeMs,
          actions: r.actions,
          undos: r.undos,
        });
        if (!current()) return;
        if (!res.valid) {
          setVerification({
            status: "rejected",
            message:
              "The server did not accept this arrangement as a complete tiling. This should not happen; please reset and try again.",
          });
          return;
        }
        setVerification({ status: "verified", response: res });
        if (res.challenge) {
          const all = loadChallengeProgress();
          const prev = all[res.challenge.challengeId];
          all[res.challenge.challengeId] = {
            passed: !!prev?.passed || res.challenge.passed,
            attempts: (prev?.attempts ?? 0) + 1,
            bestTimeMs: res.challenge.passed
              ? Math.min(prev?.bestTimeMs ?? Infinity, r.timeMs)
              : (prev?.bestTimeMs ?? null),
            bestActions: res.challenge.passed
              ? Math.min(prev?.bestActions ?? Infinity, r.actions)
              : (prev?.bestActions ?? null),
          };
          saveChallengeProgress(all);
        }
      } catch (e) {
        if (!current()) return;
        if (e instanceof ApiError && e.status === 422)
          setVerification({ status: "rejected", message: e.message });
        else
          setVerification({
            status: "offline",
            message: e instanceof ApiError ? e.message : "Could not reach the server to verify this result.",
          });
      }
    },
    [puzzle.id],
  );
  const recorded = useRef(false);
  useEffect(() => {
    if (state.completedMs === null || recorded.current) return;
    recorded.current = true;
    const r: CompletedRun = {
      id: crypto.randomUUID(),
      puzzleId: puzzle.id,
      finishedAt: new Date().toISOString(),
      timeMs: state.completedMs,
      actions: state.stats.actions,
      undos: state.stats.undos,
      rotations: state.stats.rotations,
      placements: state.placements,
      timeline: state.timeline,
      challengeId: challenge?.id ?? null,
    };
    addRun(r);
    clearGame(puzzle.id);
    setRun(r);
    void submit(r);
  }, [state.completedMs, state, puzzle.id, challenge, submit]);

  const reset = useCallback(() => {
    recorded.current = false;
    submitSeq.current++;
    setRun(null);
    setHover(null);
    clearGame(puzzle.id);
    dispatch({ type: "reset" });
    boardRef.current?.focus();
  }, [puzzle.id]);

  // ---- selection geometry ----
  const sel = state.selection;
  const selRect = sel ? puzzle.pieces.find((p) => p.id === sel.pieceId) : undefined;
  const selSize = useMemo(() => {
    if (!sel || !selRect) return null;
    if (sel.source === "tray")
      return orientedSize(selRect, !!state.trayRotated[sel.pieceId] && canRotate(puzzle, selRect));
    const cur = state.placements.find((p) => p.pieceId === sel.pieceId);
    return cur ? { width: cur.width, height: cur.height } : null;
  }, [sel, selRect, state.trayRotated, state.placements, puzzle]);

  const ghost: Ghost | null = useMemo(() => {
    if (!sel || !selSize || state.completedMs !== null) return null;
    const base = hover ? anchor(hover, selSize, board) : sel.source === "tray" ? state.cursor : null;
    if (!base) return null;
    const c = checkPlacement(board, state.placements, { pieceId: sel.pieceId, ...base, ...selSize });
    return { ...base, ...selSize, valid: c.ok, label: labelFor(puzzle, sel.pieceId) };
  }, [sel, selSize, hover, state.cursor, state.placements, state.completedMs, board, puzzle]);

  const marks: Record<string, PieceMark> = sel?.source === "board" ? { [sel.pieceId]: "selected" } : {};
  const showCursor = state.completedMs === null && sel?.source !== "board";

  const onActivate = (cell: { x: number; y: number }, pieceId: string | null) => {
    if (state.completedMs !== null) return;
    if (!sel) {
      if (pieceId) act({ type: "select_board", pieceId });
      return;
    }
    if (sel.source === "board") {
      if (pieceId === sel.pieceId) return act({ type: "clear_selection" });
      if (pieceId) return act({ type: "select_board", pieceId });
    }
    if (!selSize) return;
    const a = anchor(cell, selSize, board);
    act({ type: "place", x: a.x, y: a.y, now: Date.now() });
  };

  const selectFromTray = (id: string) => {
    act({ type: "select_tray", pieceId: id });
    boardRef.current?.focus();
  };

  // mouse drag from the tray: release over the board to place
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  useEffect(() => {
    if (!dragId) return;
    const up = () => {
      const h = hoverRef.current;
      const r = puzzle.pieces.find((p) => p.id === dragId);
      if (h && r) {
        const size = orientedSize(r, !!state.trayRotated[r.id] && canRotate(puzzle, r));
        const a = anchor(h, size, board);
        act({ type: "place", x: a.x, y: a.y, now: Date.now() });
      }
      setDragId(null);
    };
    window.addEventListener("pointerup", up, { once: true });
    return () => window.removeEventListener("pointerup", up);
  }, [dragId, puzzle, board, state.trayRotated, act]);

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, select, textarea")) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;
    if (mod && key.toLowerCase() === "z") {
      e.preventDefault();
      return act({ type: e.shiftKey ? "redo" : "undo", now: Date.now() });
    }
    if (mod && key.toLowerCase() === "y") {
      e.preventDefault();
      return act({ type: "redo", now: Date.now() });
    }
    if (mod || e.altKey) return;
    if (key === "r" || key === "R") {
      e.preventDefault();
      return act({ type: "rotate", now: Date.now() });
    }
    if (key === "Delete" || key === "Backspace") {
      e.preventDefault();
      return act({ type: "remove", now: Date.now() });
    }
    if (key === "Escape") return act({ type: "clear_selection" });
    if (t !== boardRef.current) return;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = d[key];
    if (step) {
      e.preventDefault();
      setHover(null);
      return act({ type: "nudge", dx: step[0], dy: step[1], now: Date.now() });
    }
    if (key === "Enter" || key === " ") {
      e.preventDefault();
      if (!sel) {
        const p = pieceAt(state.placements, state.cursor.x, state.cursor.y);
        if (p) act({ type: "select_board", pieceId: p.pieceId });
      } else if (sel.source === "tray") act({ type: "place", now: Date.now() });
      else act({ type: "clear_selection" });
    }
  };

  // Page-level shortcuts: they must keep working when focus falls back to <body> (e.g. a button became disabled).
  const keyRef = useRef(onKeyDown);
  keyRef.current = onKeyDown;
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const unplaced = unplacedPieces(state);
  const selectedLabel = sel ? labelFor(puzzle, sel.pieceId) : null;
  const helper = !sel
    ? "Pick a piece from the tray, or select a piece already on the board."
    : sel.source === "tray"
      ? `Piece ${selectedLabel} (${selSize?.width} × ${selSize?.height}) selected. Click the board or press Enter to place it. R rotates.`
      : `Piece ${selectedLabel} on the board is selected. Arrow keys move it, R rotates, Delete removes, or click an empty spot to move it there.`;
  const announce = helper;
  const dimId =
    sel?.source === "board"
      ? sel.pieceId
      : hover
        ? (pieceAt(state.placements, hover.x, hover.y)?.pieceId ?? null)
        : null;

  const limits = challenge?.constraints;
  const overActions = limits?.maxActions != null && state.stats.actions > limits.maxActions;
  const overUndos = limits?.maxUndos != null && state.stats.undos > limits.maxUndos;
  const overTime = limits?.maxSeconds != null && elapsed / 1000 > limits.maxSeconds;

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">{inChallenge ? "Challenge" : "Puzzle"}</span>
          <h1>{challenge ? challenge.title : puzzle.name}</h1>
          <p>
            {challenge
              ? challenge.objective
              : `Fill the ${board.width} × ${board.height} board with all ${puzzle.pieces.length} pieces. Nothing may overlap or leave the board.`}
            {!puzzle.allowRotation && " Rotation is turned off for this puzzle."}
          </p>
        </div>
        {!inChallenge && <PuzzlePicker value={puzzle.id} onChange={(id) => navigate(`/play/${id}`)} />}
      </div>

      {state.completedMs !== null && run && (
        <div style={{ marginBottom: "var(--s-5)" }}>
          <ResultsPanel
            puzzle={puzzle}
            run={run}
            verification={verification}
            challenge={challenge}
            onRetry={reset}
            onResubmit={() => void submit(run)}
          />
        </div>
      )}

      <div className="workbench">
        <div className="stack">
          <div className="board-wrap">
            <div
              ref={boardRef}
              className="board-focus"
              tabIndex={state.completedMs === null ? 0 : -1}
              role="group"
              aria-label={`Puzzle board, ${board.width} by ${board.height}. ${state.placements.length} of ${puzzle.pieces.length} pieces placed.`}
              aria-describedby={helpId}
            >
              <Board
                board={board}
                puzzle={puzzle}
                placements={state.placements}
                ghost={ghost}
                marks={marks}
                cursor={showCursor && !hover ? state.cursor : null}
                showFree={prefs.showFreeHatch}
                showLabels={prefs.showLabels}
                showDimensions={prefs.showDimensions}
                dimensionFor={dimId}
                interactive={state.completedMs === null}
                onCell={setHover}
                onActivate={onActivate}
                ariaLabel={`Board with ${state.placements.length} pieces placed`}
              />
            </div>
          </div>
          <div id={helpId} className="muted" style={{ fontSize: "0.92rem" }}>
            <strong>Keyboard:</strong> <span className="kbd">Tab</span> to the board,{" "}
            <span className="kbd">←↑↓→</span> move the cursor, <span className="kbd">Enter</span> place or
            pick up, <span className="kbd">R</span> rotate, <span className="kbd">Del</span> remove,{" "}
            <span className="kbd">Esc</span> deselect, <span className="kbd">Ctrl/⌘ Z</span> undo.
          </div>
          <div aria-live="polite" role="status" className="sr-only">
            {state.feedback ? "" : announce}
          </div>
          {state.feedback && state.completedMs === null ? (
            <Notice
              kind={
                state.feedback.kind === "error"
                  ? "error"
                  : state.feedback.kind === "success"
                    ? "success"
                    : "info"
              }
              role={state.feedback.kind === "error" ? "alert" : "status"}
            >
              {state.feedback.text}
            </Notice>
          ) : state.completedMs === null ? (
            <Notice kind="info">{helper}</Notice>
          ) : null}
        </div>

        <aside className="stack" aria-label="Controls and progress">
          {challenge && limits && (
            <Panel title="Challenge limits">
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {limits.maxActions != null && (
                  <li className={overActions ? "badge danger" : undefined}>
                    Actions {state.stats.actions} / {limits.maxActions}
                  </li>
                )}
                {limits.maxUndos != null && (
                  <li className={overUndos ? "badge danger" : undefined}>
                    Undos {state.stats.undos} / {limits.maxUndos}
                  </li>
                )}
                {limits.maxSeconds != null && (
                  <li className={overTime ? "badge danger" : undefined}>
                    Time {formatDuration(elapsed)} / {formatDuration(limits.maxSeconds * 1000)}
                  </li>
                )}
                {limits.maxActions == null && limits.maxUndos == null && limits.maxSeconds == null && (
                  <li>No extra limits. Just solve it.</li>
                )}
              </ul>
              {(overActions || overUndos || overTime) && (
                <Notice kind="warn">
                  A limit has been passed. You can still finish, but this attempt will not pass the challenge.
                </Notice>
              )}
            </Panel>
          )}

          <Panel title={`Pieces · ${unplaced.length} left`}>
            <PieceTray
              puzzle={puzzle}
              placements={state.placements}
              selectedId={sel?.source === "tray" ? sel.pieceId : null}
              trayRotated={state.trayRotated}
              onSelect={selectFromTray}
              onPointerDownPiece={(id, e) => {
                if (e.pointerType === "mouse" && e.button === 0 && state.completedMs === null) {
                  setDragId(id);
                  act({ type: "select_tray", pieceId: id });
                }
              }}
            />
          </Panel>

          <Panel title="Actions">
            <div className="btn-group">
              <button
                type="button"
                className="btn secondary"
                onClick={() => act({ type: "rotate", now: Date.now() })}
                disabled={!sel || state.completedMs !== null}
              >
                Rotate <span className="kbd">R</span>
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => act({ type: "remove", now: Date.now() })}
                disabled={sel?.source !== "board" || state.completedMs !== null}
              >
                Remove
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => act({ type: "undo", now: Date.now() })}
                disabled={state.past.length === 0 || state.completedMs !== null}
              >
                Undo
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => act({ type: "redo", now: Date.now() })}
                disabled={state.future.length === 0 || state.completedMs !== null}
              >
                Redo
              </button>
              <button type="button" className="btn danger" onClick={reset}>
                Reset
              </button>
            </div>
            {state.stats.undos > 0 && (
              <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
                Undos used: {state.stats.undos}
              </p>
            )}
          </Panel>
          <Panel title="Progress">
            <div className="stack">
              <ProgressBar value={covered} max={total} label="Board covered" />
              <Stats>
                <Stat
                  label="Covered"
                  value={`${Math.round((covered / total) * 100)}%`}
                  hint={`${formatInt(covered)} / ${formatInt(total)}`}
                />
                <Stat label="Placed" value={`${state.placements.length} / ${puzzle.pieces.length}`} />
                <Stat label="Time" value={formatDuration(elapsed)} />
                <Stat label="Actions" value={formatInt(state.stats.actions)} />
              </Stats>
            </div>
          </Panel>

          <PlaygroundGuide state={state} />
        </aside>
      </div>
    </div>
  );
}

function PlaygroundGuide({ state }: { state: GameState }) {
  if (state.placements.length > 0) return null;
  return (
    <Panel title="How to play">
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        <li>Select a piece in the tray.</li>
        <li>
          Rotate it with <span className="kbd">R</span> if you want.
        </li>
        <li>
          Click (or tap) the board to place it. The dashed outline shows where it will land, and turns red if
          it can’t.
        </li>
        <li>Select a placed piece to move, rotate or remove it.</li>
      </ol>
    </Panel>
  );
}
