import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TEST_PUZZLE } from "../test/mockApi";
import type { CompletedRun } from "../lib/storage";
import { ResultsPanel } from "./Results";

const run: CompletedRun = {
  id: "r",
  puzzleId: "t",
  finishedAt: "2026-01-01T00:00:00Z",
  timeMs: 83_000,
  actions: 5,
  undos: 1,
  rotations: 2,
  timeline: [],
  challengeId: null,
  placements: [{ pieceId: "a", x: 0, y: 0, width: 4, height: 2, rotated: false }],
};
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("ResultsPanel", () => {
  it("shows time, actions against the theoretical minimum, undos and rotations", () => {
    wrap(<ResultsPanel puzzle={TEST_PUZZLE} run={run} verification={{ status: "pending" }} />);
    expect(screen.getByRole("heading", { name: "Puzzle solved in 1:23" })).toBeInTheDocument();
    expect(screen.getByText("min 3")).toBeInTheDocument();
    expect(screen.getByText("Checking your arrangement with the server…")).toBeInTheDocument();
  });
  it("says plainly that time and action counts are not server-verified", () => {
    wrap(
      <ResultsPanel
        puzzle={TEST_PUZZLE}
        run={run}
        verification={{
          status: "verified",
          response: {
            valid: true,
            validation: { valid: true, errors: [] },
            minimumActions: 3,
            attemptId: 1,
            challenge: null,
          },
        }}
      />,
    );
    expect(screen.getByText(/not verified/)).toBeInTheDocument();
  });
  it("lists each challenge check with pass/fail and feedback", () => {
    const challenge = {
      id: "c",
      title: "Steady Hands",
      difficulty: "easy" as const,
      puzzleId: "t",
      objective: "",
      description: "",
      constraints: { maxActions: null, maxSeconds: null, maxUndos: 0 },
    };
    wrap(
      <ResultsPanel
        puzzle={TEST_PUZZLE}
        run={run}
        challenge={challenge}
        verification={{
          status: "verified",
          response: {
            valid: true,
            validation: { valid: true, errors: [] },
            minimumActions: 3,
            attemptId: 1,
            challenge: {
              challengeId: "c",
              solved: true,
              passed: false,
              feedback: "Solved, but the constraints were not met: No undo used.",
              checks: [
                { id: "solved", label: "Board completely tiled", passed: true, actual: null, limit: null },
                { id: "undos", label: "No undo used", passed: false, actual: 1, limit: 0 },
              ],
            },
          },
        }}
      />,
    );
    expect(screen.getByText("Not met")).toBeInTheDocument();
    expect(screen.getByText(/Solved, but the constraints were not met/)).toBeInTheDocument();
    expect(screen.getByText("(1 / 0)")).toBeInTheDocument();
  });
  it("links onward to the algorithm and comparison", () => {
    wrap(<ResultsPanel puzzle={TEST_PUZZLE} run={run} verification={{ status: "pending" }} />);
    expect(screen.getByRole("link", { name: "Watch the algorithm" })).toHaveAttribute("href", "/explore/t");
    expect(screen.getByRole("link", { name: "Compare with algorithm" })).toHaveAttribute(
      "href",
      "/compare/t",
    );
  });
  it("shows a rejection prominently", () => {
    wrap(
      <ResultsPanel
        puzzle={TEST_PUZZLE}
        run={run}
        verification={{ status: "rejected", message: "not accepted" }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("not accepted");
  });
});
