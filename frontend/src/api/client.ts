import type {
  ApiErrorBody,
  AttemptRequest,
  AttemptResponse,
  Challenge,
  Limits,
  ListPuzzlesResponse,
  ProgressResponse,
  PuzzleAnalysis,
  PuzzleDetail,
  PuzzleInput,
  SolutionsResponse,
  SolveRequest,
  SolveResponse,
  ValidateResponse,
} from "@shared/api";
import type { Placement } from "@shared/edison";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: ApiErrorBody["error"]["details"] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "network_error",
      "Can't reach the Edison server. Check that it is running, then try again.",
    );
  }
  if (res.status === 204) return undefined as T;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(
      res.status,
      "bad_response",
      `The server returned an unreadable response (HTTP ${res.status}).`,
    );
  }
  if (!res.ok) {
    const e = (body as Partial<ApiErrorBody>)?.error;
    throw new ApiError(
      res.status,
      e?.code ?? "http_error",
      e?.message ?? `Request failed (HTTP ${res.status}).`,
      e?.details ?? [],
    );
  }
  return body as T;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });
const enc = encodeURIComponent;

export const api = {
  limits: () => request<Limits>("/api/limits"),
  puzzles: () => request<ListPuzzlesResponse>("/api/puzzles"),
  puzzle: (id: string) => request<PuzzleDetail>(`/api/puzzles/${enc(id)}`),
  analyze: (input: PuzzleInput) => post<PuzzleAnalysis>("/api/puzzles/analyze", input),
  createPuzzle: (input: PuzzleInput) => post<PuzzleDetail>("/api/puzzles", input),
  deletePuzzle: (id: string) => request<void>(`/api/puzzles/${enc(id)}`, { method: "DELETE" }),
  solve: (id: string, req: SolveRequest = {}) => post<SolveResponse>(`/api/puzzles/${enc(id)}/solve`, req),
  validate: (id: string, placements: Placement[]) =>
    post<ValidateResponse>(`/api/puzzles/${enc(id)}/validate`, { placements }),
  solutions: (id: string) => request<SolutionsResponse>(`/api/puzzles/${enc(id)}/solutions`),
  challenges: () => request<{ challenges: Challenge[] }>("/api/challenges"),
  submitAttempt: (req: AttemptRequest) => post<AttemptResponse>("/api/attempts", req),
  progress: (clientId: string) => request<ProgressResponse>(`/api/progress?clientId=${enc(clientId)}`),
};
