import type { StreamDone } from "@shared/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { streamSolve } from "../api/stream";
import { Replay } from "./replay";

export type RecordingStatus = "idle" | "recording" | "ready" | "error";

interface Cached {
  replay: Replay;
  done: StreamDone;
}
/** Finished recordings survive navigation between pages (Explorer -> Compare). In memory only. */
const cache = new Map<string, Cached>();

export function clearRecordingCache() {
  cache.clear();
}

export interface Recording {
  replay: Replay;
  /** Changes whenever events were appended; use it to re-render. */
  version: number;
  status: RecordingStatus;
  done: StreamDone | null;
  error: string | null;
  start: () => void;
  cancel: () => void;
}

const MAX_EVENTS = 100_000;

export function useRecording(puzzleId: string): Recording {
  const cached = cache.get(puzzleId);
  const [replay, setReplay] = useState<Replay>(() => cached?.replay ?? new Replay());
  const [status, setStatus] = useState<RecordingStatus>(cached ? "ready" : "idle");
  const [done, setDone] = useState<StreamDone | null>(cached?.done ?? null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setStatus((s) => (s === "recording" ? "ready" : s));
  }, []);

  const start = useCallback(() => {
    cancelRef.current?.();
    const fresh = new Replay();
    setReplay(fresh);
    setDone(null);
    setError(null);
    setVersion(0);
    setStatus("recording");
    cancelRef.current = streamSolve(
      puzzleId,
      { maxSolutions: 1, maxEvents: MAX_EVENTS, timeLimitSeconds: 20, trace: true },
      {
        onEvents: (batch) => {
          fresh.append(batch);
          setVersion((v) => v + 1);
        },
        onDone: (d) => {
          cancelRef.current = null;
          cache.set(puzzleId, { replay: fresh, done: d });
          setDone(d);
          setStatus("ready");
        },
        onError: (m) => {
          cancelRef.current = null;
          setError(m);
          setStatus("error");
        },
      },
    );
  }, [puzzleId]);

  // switching puzzle: stop the old search and load that puzzle's cached recording (if any)
  useEffect(() => {
    const c = cache.get(puzzleId);
    cancelRef.current?.();
    cancelRef.current = null;
    setReplay(c?.replay ?? new Replay());
    setDone(c?.done ?? null);
    setStatus(c ? "ready" : "idle");
    setError(null);
    setVersion(0);
  }, [puzzleId]);

  useEffect(() => () => cancelRef.current?.(), []);

  return { replay, version, status, done, error, start, cancel };
}
