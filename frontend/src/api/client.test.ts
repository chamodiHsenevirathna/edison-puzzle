import { api, ApiError } from "./client";
import { streamSolve } from "./stream";

function mockFetch(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status }));
}
afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("returns parsed JSON", async () => {
    const f = mockFetch(200, { puzzles: [] });
    await expect(api.puzzles()).resolves.toEqual({ puzzles: [] });
    expect(f).toHaveBeenCalledWith("/api/puzzles", expect.anything());
  });
  it("maps the server error envelope to ApiError", async () => {
    mockFetch(404, { error: { code: "puzzle_not_found", message: "No puzzle", details: [] } });
    await expect(api.puzzle("x")).rejects.toMatchObject({
      status: 404,
      code: "puzzle_not_found",
      message: "No puzzle",
    });
  });
  it("keeps validation details", async () => {
    mockFetch(422, {
      error: {
        code: "invalid_puzzle",
        message: "bad",
        details: [{ code: "area_too_small", message: "short" }],
      },
    });
    const e = await api
      .createPuzzle({ name: "", board: { width: 1, height: 1 }, pieces: [], allowRotation: true })
      .catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.details[0].code).toBe("area_too_small");
  });
  it("reports an unreachable server clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.puzzles()).rejects.toMatchObject({ code: "network_error", status: 0 });
  });
  it("handles non-JSON error pages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>502</html>", { status: 502 }));
    await expect(api.puzzles()).rejects.toMatchObject({ code: "bad_response", status: 502 });
  });
  it("handles 204 responses", async () => {
    mockFetch(204, null);
    await expect(api.deletePuzzle("c-1")).resolves.toBeUndefined();
  });
  it("posts JSON bodies and encodes ids", async () => {
    const f = mockFetch(200, { valid: true, errors: [] });
    await api.validate("a b", []);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/puzzles/a%20b/validate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ placements: [] });
  });
});

class FakeES {
  static last: FakeES;
  listeners: Record<string, ((e: MessageEvent | Event) => void)[]> = {};
  closed = false;
  constructor(public url: string) {
    FakeES.last = this;
  }
  addEventListener(t: string, fn: (e: MessageEvent | Event) => void) {
    (this.listeners[t] ??= []).push(fn);
  }
  close() {
    this.closed = true;
  }
  emit(t: string, data?: unknown) {
    const e = data === undefined ? new Event(t) : new MessageEvent(t, { data: JSON.stringify(data) });
    this.listeners[t]?.forEach((f) => f(e));
  }
}

describe("streamSolve", () => {
  const ES = FakeES as unknown as typeof EventSource;
  const handlers = () => ({ onEvents: vi.fn(), onDone: vi.fn(), onError: vi.fn() });

  it("builds the URL from options", () => {
    streamSolve("edison-original", { maxSolutions: "all", maxEvents: 1000, trace: false }, handlers(), ES);
    expect(FakeES.last.url).toBe(
      "/api/puzzles/edison-original/solve/stream?compact=true&trace=false&maxSolutions=all&maxEvents=1000",
    );
  });
  it("delivers batches then done, and closes the connection", () => {
    const h = handlers();
    streamSolve("p", {}, h, ES);
    FakeES.last.emit("events", [{ type: "solver_started", seq: 0 }]);
    expect(h.onEvents).toHaveBeenCalledWith([{ type: "solver_started", seq: 0 }]);
    FakeES.last.emit("done", { status: "max_solutions" });
    expect(h.onDone).toHaveBeenCalledOnce();
    expect(FakeES.last.closed).toBe(true);
  });
  it("cancel closes the connection (this is what stops the server search)", () => {
    const cancel = streamSolve("p", {}, handlers(), ES);
    cancel();
    expect(FakeES.last.closed).toBe(true);
  });
  it("ignores late events after cancel", () => {
    const h = handlers();
    const cancel = streamSolve("p", {}, h, ES);
    cancel();
    FakeES.last.emit("events", []);
    expect(h.onEvents).not.toHaveBeenCalled();
  });
  it("reports a server error frame with its message", () => {
    const h = handlers();
    streamSolve("p", {}, h, ES);
    FakeES.last.emit("error", { code: "solver_busy", message: "The solver is busy." });
    expect(h.onError).toHaveBeenCalledWith("The solver is busy.");
    expect(FakeES.last.closed).toBe(true);
  });
  it("reports a dropped connection and does not auto-reconnect", () => {
    const h = handlers();
    streamSolve("p", {}, h, ES);
    FakeES.last.emit("error");
    expect(h.onError).toHaveBeenCalledWith("The connection to the solver was lost.");
    expect(FakeES.last.closed).toBe(true);
  });
});
