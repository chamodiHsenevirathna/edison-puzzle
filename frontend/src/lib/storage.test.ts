import {
  addRun,
  bestRun,
  getClientId,
  loadGame,
  loadLastRun,
  loadPrefs,
  loadRuns,
  saveGame,
  savePrefs,
  type CompletedRun,
} from "./storage";

const run = (id: string, timeMs: number, puzzleId = "p"): CompletedRun => ({
  id,
  puzzleId,
  finishedAt: "2026-01-01T00:00:00Z",
  timeMs,
  actions: 5,
  undos: 0,
  rotations: 0,
  placements: [],
  timeline: [],
  challengeId: null,
});

describe("storage", () => {
  it("generates a valid, stable client id", () => {
    const a = getClientId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(getClientId()).toBe(a);
  });
  it("regenerates a malformed stored client id", () => {
    window.localStorage.setItem("edison:clientId", '"bad id!"');
    expect(getClientId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
  it("returns defaults for missing or corrupt preferences", () => {
    expect(loadPrefs().showLabels).toBe(true);
    window.localStorage.setItem("edison:prefs", "{not json");
    expect(loadPrefs().explorerSpeed).toBeGreaterThan(0);
    window.localStorage.setItem(
      "edison:prefs",
      JSON.stringify({ showLabels: "yes", explorerSpeed: -3, reduceMotion: "on" }),
    );
    const p = loadPrefs();
    expect(p.showLabels).toBe(true); // wrong type ignored
    expect(p.explorerSpeed).toBeGreaterThan(0);
    expect(p.reduceMotion).toBe("on");
  });
  it("round-trips preferences", () => {
    savePrefs({ ...loadPrefs(), showLabels: false });
    expect(loadPrefs().showLabels).toBe(false);
  });
  it("rejects a saved game for the wrong puzzle or schema", () => {
    window.localStorage.setItem("edison:game:p", JSON.stringify({ version: 2 }));
    expect(loadGame("p")).toBeNull();
    saveGame({
      version: 1,
      puzzleId: "p",
      placements: [],
      stats: { actions: 0, undos: 0, redos: 0, rotations: 0 },
      elapsedMs: 0,
      timeline: [],
    });
    expect(loadGame("p")).not.toBeNull();
    expect(loadGame("q")).toBeNull();
  });
  it("keeps the most recent 20 runs and remembers the last one", () => {
    for (let i = 0; i < 25; i++) addRun(run(`r${i}`, 1000 + i));
    const runs = loadRuns("p");
    expect(runs).toHaveLength(20);
    expect(runs[0]?.id).toBe("r24");
    expect(loadLastRun()?.id).toBe("r24");
  });
  it("finds the fastest run", () => {
    expect(bestRun([run("a", 500), run("b", 300), run("c", 900)])?.id).toBe("b");
    expect(bestRun([])).toBeNull();
  });
  it("ignores malformed runs in storage", () => {
    window.localStorage.setItem("edison:runs:p", JSON.stringify([{ nope: 1 }, run("ok", 1)]));
    expect(loadRuns("p").map((r) => r.id)).toEqual(["ok"]);
  });
  it("survives localStorage throwing", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadPrefs().showLabels).toBe(true);
    expect(loadRuns("p")).toEqual([]);
    spy.mockRestore();
  });
});

describe("storage: corrupt or stale data", () => {
  const base = {
    version: 1,
    puzzleId: "p",
    placements: [],
    stats: { actions: 0, undos: 0, redos: 0, rotations: 0 },
    elapsedMs: 0,
    timeline: [],
  };
  const put = (v: unknown) => window.localStorage.setItem("edison:game:p", JSON.stringify(v));
  it("rejects a saved game whose timeline is not an array", () => {
    put({ ...base, timeline: "oops" });
    expect(loadGame("p")?.timeline ?? []).toEqual([]);
  });
  it("drops malformed placements and non-numeric stats instead of passing them on", () => {
    put({
      ...base,
      placements: [null, 3, { pieceId: "a", x: "0", y: 0, width: 1, height: 1, rotated: false }],
      stats: { actions: "many", undos: 1, redos: 0, rotations: 0 },
      elapsedMs: "soon",
    });
    const g = loadGame("p");
    expect(g?.placements ?? []).toEqual([]);
    expect(g?.stats.actions).toBe(0);
    expect(g?.stats.undos).toBe(1);
    expect(g?.elapsedMs).toBe(0);
  });
  it("ignores runs with missing counters or non-finite times", () => {
    const ok = run("ok", 1);
    const noActions = { ...run("bad1", 1), actions: undefined };
    const nan = { ...run("bad2", 1), timeMs: null };
    window.localStorage.setItem("edison:runs:p", JSON.stringify([noActions, nan, ok]));
    expect(loadRuns("p").map((r) => r.id)).toEqual(["ok"]);
  });
});
