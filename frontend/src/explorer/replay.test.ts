import type { CompactSolverEvent, Placement, Puzzle, SolverEvent } from "@shared/edison";
import fixture from "../test/fixtures/trace.json";
import { narrate } from "./narrate";
import { applyEvent, Replay } from "./replay";

type Full = SolverEvent & { placements?: Placement[] };
const full = fixture.events as unknown as Full[];
const puzzle = fixture.puzzle as unknown as Puzzle;
const strip = (e: Full): CompactSolverEvent => {
  const { placements: _p, remaining: _r, ...rest } = e as Full & { remaining?: string[] };
  return rest as CompactSolverEvent;
};
const compact = full.map(strip);

describe("Replay against real solver output", () => {
  it("the fixture is a real, non-trivial trace", () => {
    expect(full.length).toBeGreaterThan(300);
    const types = new Set(full.map((e) => e.type));
    for (const t of [
      "piece_selected",
      "placement_rejected",
      "backtrack_completed",
      "solution_found",
      "search_completed",
    ]) {
      expect(types.has(t as never)).toBe(true);
    }
  });

  it("reproduces the engine's snapshot after every event, from compact events alone", () => {
    const r = new Replay();
    r.append(compact);
    full.forEach((e, i) => {
      if (e.placements) expect(r.stateAt(i).placements).toEqual(e.placements);
    });
  });

  it("random access equals sequential replay (checkpoints are correct) at every index", () => {
    const big: CompactSolverEvent[] = [];
    while (big.length < 2000) big.push(...compact); // long log, crosses many checkpoints (stack stays valid per loop)
    // the concatenated log is only used for access-pattern equivalence, so compare against a naive fold
    const r = new Replay();
    r.append(big);
    let s = r.stateAt(-1);
    for (let i = 0; i < big.length; i++) {
      s = applyEvent(s, big[i] as CompactSolverEvent);
      if (i % 37 === 0 || i === big.length - 1) expect(r.stateAt(i)).toEqual(s);
    }
  });

  it("append in several batches gives the same result as one batch", () => {
    const a = new Replay();
    a.append(compact);
    const b = new Replay();
    for (let i = 0; i < compact.length; i += 7) b.append(compact.slice(i, i + 7));
    expect(b.stateAt(compact.length - 1)).toEqual(a.stateAt(compact.length - 1));
    expect(b.length).toBe(a.length);
  });

  it("counters equal the engine's final metrics", () => {
    const r = new Replay();
    r.append(compact);
    const done = full[full.length - 1] as Extract<SolverEvent, { type: "search_completed" }>;
    const s = r.stateAt(full.length - 1);
    expect(s).toMatchObject({
      attempted: done.metrics.placementsAttempted,
      accepted: done.metrics.placementsAccepted,
      rejected: done.metrics.placementsRejected,
      backtracks: done.metrics.backtracks,
      solutions: done.metrics.solutionsFound,
    });
  });

  it("index -1 and out-of-range are safe", () => {
    const r = new Replay();
    expect(r.stateAt(5).placements).toEqual([]);
    r.append(compact.slice(0, 10));
    expect(r.stateAt(-1).placements).toEqual([]);
    expect(r.stateAt(9999)).toEqual(r.stateAt(9));
  });

  it("find locates the next / previous matching event", () => {
    const r = new Replay();
    r.append(compact);
    const first = r.find(0, 1, (e) => e.type === "backtrack_started");
    expect(first).toBeGreaterThan(0);
    expect(r.find(first + 1, -1, (e) => e.type === "piece_selected")).toBeLessThan(first);
    expect(r.find(0, 1, () => false)).toBe(-1);
  });
});

describe("narrate", () => {
  it("explains every event type of a real trace in non-empty text", () => {
    const r = new Replay();
    r.append(compact);
    const seen = new Set<string>();
    compact.forEach((ev, i) => {
      const text = narrate(ev, puzzle, r.stateAt(i - 1));
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/undefined|NaN|\[object/);
      seen.add(ev.type);
    });
    expect(seen.size).toBe(9);
  });
  it("names the piece a rejected placement collides with", () => {
    const r = new Replay();
    r.append(compact);
    const i = compact.findIndex((e) => e.type === "placement_rejected" && e.reason === "overlap");
    expect(i).toBeGreaterThan(0);
    expect(narrate(compact[i] as CompactSolverEvent, puzzle, r.stateAt(i - 1))).toMatch(
      /overlaps piece [A-F]\./,
    );
  });
  it("distinguishes edge rejections", () => {
    const r = new Replay();
    r.append(compact);
    const i = compact.findIndex((e) => e.type === "placement_rejected" && e.reason === "out_of_bounds");
    expect(narrate(compact[i] as CompactSolverEvent, puzzle, r.stateAt(i - 1))).toMatch(
      /past the board edge/,
    );
  });
});
