import type { GallerySolution } from "@shared/api";
import type { Placement } from "@shared/edison";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Replay } from "../explorer/replay";
import { addRun } from "../lib/storage";
import { apiMock, resetApiMock, TEST_PUZZLE } from "../test/mockApi";
import { Compare } from "./Compare";

vi.mock("../api/client", async () => {
  const { apiMock } = await import("../test/mockApi");
  return { api: apiMock, ApiError: class extends Error {} };
});
const recMock = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../explorer/useRecording", () => ({ useRecording: () => recMock.value }));

const P = (id: string, x: number, y: number, w: number, h: number): Placement => ({
  pieceId: id,
  x,
  y,
  width: w,
  height: h,
  rotated: false,
});
const A = [P("a", 0, 0, 4, 2), P("b", 0, 2, 2, 2), P("c", 2, 2, 2, 2)];
const B = [P("a", 0, 2, 4, 2), P("b", 0, 0, 2, 2), P("c", 2, 0, 2, 2)];
const sol = (index: number, label: string, placements: Placement[]): GallerySolution => ({
  index,
  familyId: 0,
  canonical: index === 0,
  transform: label,
  transformLabel: label,
  placements,
});
const done = {
  status: "max_solutions",
  truncated: false,
  metrics: {
    nodesVisited: 5,
    placementsAttempted: 9,
    placementsAccepted: 4,
    placementsRejected: 5,
    backtracks: 1,
    solutionsFound: 1,
    elapsedMs: 3,
  },
};

function go(human: Placement[], algo: Placement[], known: GallerySolution[], recDone: unknown = done) {
  localStorage.clear();
  resetApiMock();
  apiMock.solutions.mockResolvedValue({ solutions: known });
  addRun({
    id: "r1",
    puzzleId: "t",
    finishedAt: new Date().toISOString(),
    timeMs: 1000,
    actions: 3,
    undos: 0,
    rotations: 0,
    placements: human,
    timeline: [],
    challengeId: null,
  });
  const replay = new Replay();
  replay.append([{ type: "solution_found", solution: { placements: algo } } as never]);
  recMock.value = {
    replay,
    version: 1,
    status: "ready",
    done: recDone,
    error: null,
    start: vi.fn(),
    cancel: vi.fn(),
  };
  render(
    <MemoryRouter initialEntries={["/compare/t"]}>
      <Routes>
        <Route path="/compare/:puzzleId" element={<Compare />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Compare", () => {
  it("does not claim a relative transform between two non-base arrangements", async () => {
    // you = arrangement 3 ("Rotated 90"), algorithm = arrangement 2 ("Mirrored"); base is #1
    go(A, B, [sol(0, "Identical", [P("a", 0, 0, 1, 1)]), sol(1, "Mirrored", B), sol(2, "Rotated 90", A)]);
    await screen.findByText(/same underlying solution/);
    expect(screen.queryByText(/rotated 90/i, { selector: "strong" })).toBeNull();
    expect(screen.getByText(/arrangement 3 versus 2/)).toBeTruthy();
  });
  it("offers a re-run when the recording was stopped before finishing", async () => {
    go(A, B, [], null);
    expect((await screen.findAllByRole("button", { name: /run the solver/i })).length).toBeGreaterThan(0);
  });
  it("makes no unverified speed claim about the solver", async () => {
    go(A, B, []);
    await screen.findByText(/Is this comparison fair/);
    expect(document.body.textContent).not.toMatch(/thousands of options/);
  });
});
void TEST_PUZZLE;
