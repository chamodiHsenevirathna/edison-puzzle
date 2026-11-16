import type { StreamDone } from "@shared/api";
import type { CompactSolverEvent } from "@shared/edison";

export interface StreamOptions {
  maxSolutions?: number | "all";
  maxEvents?: number;
  maxNodes?: number;
  timeLimitSeconds?: number;
  trace?: boolean;
}

export interface StreamHandlers {
  onEvents: (batch: CompactSolverEvent[]) => void;
  onDone: (done: StreamDone) => void;
  onError: (message: string) => void;
}

type EventSourceCtor = new (url: string) => EventSource;

/** Subscribe to the solver's event stream. Returns a function that cancels the search. */
export function streamSolve(
  puzzleId: string,
  opts: StreamOptions,
  handlers: StreamHandlers,
  ES: EventSourceCtor = EventSource,
): () => void {
  const q = new URLSearchParams({ compact: "true", trace: String(opts.trace ?? true) });
  q.set("maxSolutions", String(opts.maxSolutions ?? 1));
  if (opts.maxEvents) q.set("maxEvents", String(opts.maxEvents));
  if (opts.maxNodes) q.set("maxNodes", String(opts.maxNodes));
  if (opts.timeLimitSeconds) q.set("timeLimitSeconds", String(opts.timeLimitSeconds));
  const es = new ES(`/api/puzzles/${encodeURIComponent(puzzleId)}/solve/stream?${q}`);
  let finished = false;
  const finish = () => {
    finished = true;
    es.close(); // closing the connection is what stops the server-side search
  };
  const malformed = () => {
    finish();
    handlers.onError("The solver sent data this page could not read.");
  };
  es.addEventListener("events", (e) => {
    if (finished) return;
    let batch: CompactSolverEvent[];
    try {
      batch = JSON.parse((e as MessageEvent<string>).data) as CompactSolverEvent[];
    } catch {
      malformed();
      return;
    }
    handlers.onEvents(batch);
  });
  es.addEventListener("done", (e) => {
    if (finished) return;
    let done: StreamDone;
    try {
      done = JSON.parse((e as MessageEvent<string>).data) as StreamDone;
    } catch {
      malformed();
      return;
    }
    finish();
    handlers.onDone(done);
  });
  es.addEventListener("error", (e) => {
    if (finished) return;
    finish();
    const data = (e as MessageEvent<string | undefined>).data;
    if (typeof data === "string") {
      let message = "The solver reported an error.";
      try {
        message = (JSON.parse(data) as { message?: string }).message ?? message;
      } catch {
        /* keep the generic message */
      }
      handlers.onError(message);
    } else {
      handlers.onError("The connection to the solver was lost.");
    }
  });
  return () => {
    if (!finished) finish();
  };
}
