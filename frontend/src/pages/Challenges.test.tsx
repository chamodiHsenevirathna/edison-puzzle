import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { apiMock, resetApiMock } from "../test/mockApi";
import { Challenges } from "./Challenges";

vi.mock("../api/client", async () => {
  const { apiMock } = await import("../test/mockApi");
  class ApiError extends Error {}
  return { api: apiMock, ApiError };
});

const C = (id: string, difficulty: string, extra = {}) => ({
  id,
  title: id.toUpperCase(),
  difficulty,
  puzzleId: "p",
  objective: `Objective ${id}`,
  description: "d",
  constraints: { maxActions: null, maxSeconds: null, maxUndos: null, ...extra },
});

beforeEach(() => {
  resetApiMock();
  apiMock.challenges.mockResolvedValue({
    challenges: [
      C("a", "easy"),
      C("b", "hard", { maxUndos: 0, maxActions: 24 }),
      C("c", "easy", { maxSeconds: 900 }),
    ],
  });
});
const setup = () =>
  render(
    <MemoryRouter>
      <Challenges />
    </MemoryRouter>,
  );

describe("Challenges", () => {
  it("groups by difficulty, shows constraints, and starts each in play mode", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Easy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hard" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Expert" })).toBeNull();
    const b = screen.getByRole("article", { name: "B" });
    expect(within(b).getByText("no undo")).toBeInTheDocument();
    expect(within(b).getByText("≤ 24 actions")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "C" })).getByText("≤ 15:00")).toBeInTheDocument();
    expect(within(b).getByRole("link", { name: "Start" })).toHaveAttribute("href", "/play/p?challenge=b");
  });
  it("merges server progress for completion state and bests", async () => {
    apiMock.progress.mockResolvedValue({
      puzzles: {},
      challenges: {
        a: { attempts: 2, passed: true, bestTimeMs: 65_000, bestActions: 4 },
        b: { attempts: 1, passed: false, bestTimeMs: null, bestActions: null },
      },
    });
    setup();
    const a = await screen.findByRole("article", { name: "A" });
    expect(await within(a).findByText("Completed")).toBeInTheDocument();
    expect(within(a).getByText(/Best: 1:05 · 4 actions/)).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "B" })).getByText("Attempted")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "C" })).getByText("Not started")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 complete")).toBeInTheDocument();
  });
  it("falls back to this browser's cache when the server progress call fails", async () => {
    apiMock.progress.mockRejectedValue(new Error("down"));
    window.localStorage.setItem(
      "edison:challengeProgress",
      JSON.stringify({ c: { passed: true, attempts: 1, bestTimeMs: 1000, bestActions: 5 } }),
    );
    setup();
    expect(await screen.findByText(/Couldn.t load progress from the server/)).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "C" })).getByText("Completed")).toBeInTheDocument();
  });
  it("shows an error state with retry when the list can't load", async () => {
    apiMock.challenges.mockRejectedValueOnce(new Error("boom"));
    setup();
    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
