import { streamSolve } from "./stream";

class FakeES {
  static last: FakeES;
  closed = false;
  handlers: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(public url: string) {
    FakeES.last = this;
  }
  addEventListener(t: string, f: (e: MessageEvent) => void) {
    (this.handlers[t] ??= []).push(f);
  }
  close() {
    this.closed = true;
  }
  emit(t: string, data?: string) {
    for (const f of this.handlers[t] ?? []) f({ data } as MessageEvent);
  }
}
const ES = FakeES as unknown as new (url: string) => EventSource;
const mk = () => ({ onEvents: vi.fn(), onDone: vi.fn(), onError: vi.fn() });

describe("streamSolve", () => {
  it("reports malformed payloads as an error and stops the search instead of throwing", () => {
    const h = mk();
    streamSolve("p", {}, h, ES);
    expect(() => FakeES.last.emit("events", "{not json")).not.toThrow();
    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(FakeES.last.closed).toBe(true);
    FakeES.last.emit("events", "[]");
    expect(h.onEvents).not.toHaveBeenCalled();
  });
  it("ignores everything after cancel", () => {
    const h = mk();
    const cancel = streamSolve("p", {}, h, ES);
    cancel();
    expect(FakeES.last.closed).toBe(true);
    FakeES.last.emit("events", "[]");
    FakeES.last.emit("done", "{}");
    FakeES.last.emit("error");
    expect(h.onEvents).not.toHaveBeenCalled();
    expect(h.onDone).not.toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });
  it("closes on a dropped connection so the browser cannot auto-reconnect and replay from the start", () => {
    const h = mk();
    streamSolve("p", {}, h, ES);
    FakeES.last.emit("events", "[]");
    FakeES.last.emit("error");
    expect(FakeES.last.closed).toBe(true);
    expect(h.onError).toHaveBeenCalledTimes(1);
  });
  it("closes after done", () => {
    const h = mk();
    streamSolve("p", {}, h, ES);
    FakeES.last.emit("done", '{"status":"exhausted"}');
    expect(FakeES.last.closed).toBe(true);
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });
});
