import type { CompactSolverEvent, Placement } from "@shared/edison";

export interface ReplayState {
  /** Board contents after the event. */
  placements: readonly Placement[];
  attempted: number;
  accepted: number;
  rejected: number;
  backtracks: number;
  solutions: number;
}

const EMPTY: ReplayState = {
  placements: [],
  attempted: 0,
  accepted: 0,
  rejected: 0,
  backtracks: 0,
  solutions: 0,
};

/** Pure transition for one event (copy-on-write; the input is never mutated). */
export function applyEvent(s: ReplayState, ev: CompactSolverEvent): ReplayState {
  switch (ev.type) {
    case "placement_attempted":
      return { ...s, attempted: s.attempted + 1 };
    case "placement_accepted":
      return { ...s, accepted: s.accepted + 1, placements: [...s.placements, ev.placement] };
    case "placement_rejected":
      return { ...s, rejected: s.rejected + 1 };
    case "backtrack_completed":
      return { ...s, backtracks: s.backtracks + 1, placements: s.placements.slice(0, -1) };
    case "solution_found":
      return { ...s, solutions: s.solutions + 1 };
    default:
      return s;
  }
}

const STEP = 256;

/**
 * Append-only event log with random access to the board state after any event.
 * Keeps a checkpoint every STEP events so stepping backwards or scrubbing never
 * replays more than STEP-1 events.
 */
export class Replay {
  readonly events: CompactSolverEvent[] = [];
  private checkpoints: ReplayState[] = [EMPTY]; // checkpoints[k] = state after k*STEP events
  private tail: ReplayState = EMPTY;

  get length(): number {
    return this.events.length;
  }

  append(batch: readonly CompactSolverEvent[]): void {
    for (const ev of batch) {
      this.events.push(ev);
      this.tail = applyEvent(this.tail, ev);
      if (this.events.length % STEP === 0) this.checkpoints.push(this.tail);
    }
  }

  /** State after applying events[0..index]. index = -1 gives the empty initial state. */
  stateAt(index: number): ReplayState {
    if (index < 0) return EMPTY;
    const i = Math.min(index, this.events.length - 1);
    if (i < 0) return EMPTY;
    const n = i + 1;
    const k = Math.floor(n / STEP);
    let s = this.checkpoints[k] ?? EMPTY;
    for (let j = k * STEP; j < n; j++) s = applyEvent(s, this.events[j] as CompactSolverEvent);
    return s;
  }

  /** Index of the next event at or after `from` matching `pred`, or -1. */
  find(from: number, dir: 1 | -1, pred: (e: CompactSolverEvent) => boolean): number {
    for (let i = from; i >= 0 && i < this.events.length; i += dir)
      if (pred(this.events[i] as CompactSolverEvent)) return i;
    return -1;
  }
}
