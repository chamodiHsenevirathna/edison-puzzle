import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PrefsProvider } from "../lib/prefs";
import { apiMock, resetApiMock } from "../test/mockApi";
import { Playground } from "./Playground";

vi.mock("../api/client", async () => {
  const { apiMock } = await import("../test/mockApi");
  class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public details: unknown[] = [],
    ) {
      super(message);
    }
  }
  return { api: apiMock, ApiError };
});

function renderPlayground(path = "/play/t") {
  return render(
    <PrefsProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/play/:puzzleId" element={<Playground />} />
        </Routes>
      </MemoryRouter>
    </PrefsProvider>,
  );
}
const board = () => screen.getByRole("group", { name: /Puzzle board/ });
const placed = () => within(board()).getByRole("img").getAttribute("aria-label");

beforeEach(() => {
  resetApiMock();
  apiMock.submitAttempt.mockResolvedValue({
    valid: true,
    validation: { valid: true, errors: [] },
    minimumActions: 3,
    attemptId: 1,
    challenge: null,
  });
});

async function place(user: ReturnType<typeof userEvent.setup>, piece: string, moves: string[] = []) {
  await user.click(screen.getByRole("button", { name: new RegExp(`^Piece ${piece} `) }));
  for (const m of moves) await user.keyboard(m);
  await user.keyboard("{Enter}");
}

describe("Playground", () => {
  it("shows loading, then the puzzle", async () => {
    renderPlayground();
    expect(screen.getByText(/Loading puzzle/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Test puzzle" })).toBeInTheDocument();
    expect(screen.getByText("Pieces · 3 left")).toBeInTheDocument();
  });

  it("shows a not-found state for an unknown puzzle", async () => {
    const { ApiError } = await import("../api/client");
    apiMock.puzzle.mockRejectedValue(new ApiError(404, "puzzle_not_found", "nope"));
    renderPlayground();
    expect(await screen.findByRole("heading", { name: "Puzzle not found" })).toBeInTheDocument();
  });

  it("shows a retryable error when the server is unreachable", async () => {
    const { ApiError } = await import("../api/client");
    apiMock.puzzle.mockRejectedValueOnce(new ApiError(0, "network_error", "Can't reach the Edison server."));
    const user = userEvent.setup();
    renderPlayground();
    expect(await screen.findByRole("heading", { name: "Server unreachable" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Test puzzle" })).toBeInTheDocument();
  });

  it("places a piece with the keyboard, moves the progress counters and removes it from the tray", async () => {
    const user = userEvent.setup();
    renderPlayground();
    await screen.findByRole("heading", { level: 1 });
    await place(user, "A");
    expect(placed()).toMatch(/1 pieces placed/);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByText("Pieces · 2 left")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Piece A / })).toBeNull();
  });

  it("explains a refused placement and keeps the piece selected", async () => {
    const user = userEvent.setup();
    renderPlayground();
    await screen.findByRole("heading", { level: 1 });
    await place(user, "A"); // 4x2 at (0,0)
    await user.click(screen.getByRole("button", { name: /^Piece B / }));
    await user.keyboard("{Enter}"); // cursor still (0,0): overlaps A
    expect(await screen.findByRole("alert")).toHaveTextContent(/overlaps piece A/);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Piece B / })).toHaveAttribute("aria-pressed", "true");
  });

  it("rotates a tray piece with R before placing", async () => {
    const user = userEvent.setup();
    renderPlayground();
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: /^Piece A / }));
    await user.keyboard("r");
    expect(screen.getByRole("button", { name: /Piece A 2×4 rotated/ })).toBeInTheDocument();
  });

  it("undo and redo via buttons and Ctrl+Z", async () => {
    const user = userEvent.setup();
    renderPlayground();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    await place(user, "A");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
  });

  it("persists a game in progress and restores it on the next visit", async () => {
    const user = userEvent.setup();
    const first = renderPlayground();
    await screen.findByRole("heading", { level: 1 });
    await place(user, "A");
    first.unmount();
    renderPlayground();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("Reset clears the board and the saved game", async () => {
    const user = userEvent.setup();
    renderPlayground();
    await screen.findByRole("heading", { level: 1 });
    await place(user, "A");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
    expect(window.localStorage.getItem("edison:game:t")).toBeNull();
  });

  it("completes the puzzle, records the run and shows the server-verified result", async () => {
    const user = userEvent.setup();
    renderPlayground();
    await screen.findByRole("heading", { level: 1 });
    await place(user, "A");
    await place(user, "B", ["{ArrowDown}", "{ArrowDown}"]);
    await place(user, "C", ["{ArrowRight}", "{ArrowRight}"]);
    expect(await screen.findByRole("heading", { name: /Puzzle solved in/ })).toBeInTheDocument();
    await waitFor(() => expect(apiMock.submitAttempt).toHaveBeenCalledTimes(1));
    const req = apiMock.submitAttempt.mock.calls[0]![0];
    expect(req).toMatchObject({ puzzleId: "t", actions: 3, undos: 0, challengeId: null });
    expect(req.placements).toHaveLength(3);
    expect(req.clientId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(await screen.findByText(/server independently checked/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("edison:runs:t")!)).toHaveLength(1);
    expect(window.localStorage.getItem("edison:game:t")).toBeNull();
    // the board is frozen after completion
    await user.keyboard("{Delete}");
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("keeps the result and offers a retry when the server cannot verify it", async () => {
    const { ApiError } = await import("../api/client");
    apiMock.submitAttempt.mockRejectedValueOnce(
      new ApiError(0, "network_error", "Can't reach the Edison server."),
    );
    const user = userEvent.setup();
    renderPlayground();
    await screen.findByRole("heading", { level: 1 });
    await place(user, "A");
    await place(user, "B", ["{ArrowDown}", "{ArrowDown}"]);
    await place(user, "C", ["{ArrowRight}", "{ArrowRight}"]);
    expect(await screen.findByText(/saved in this browser/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("edison:runs:t")!)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Retry verification" }));
    expect(await screen.findByText(/server independently checked/)).toBeInTheDocument();
    expect(apiMock.submitAttempt).toHaveBeenCalledTimes(2);
  });

  it("'Try again' after completion starts a fresh game", async () => {
    const user = userEvent.setup();
    renderPlayground();
    await screen.findByRole("heading", { level: 1 });
    await place(user, "A");
    await place(user, "B", ["{ArrowDown}", "{ArrowDown}"]);
    await place(user, "C", ["{ArrowRight}", "{ArrowRight}"]);
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Puzzle solved/ })).toBeNull();
  });

  it("challenge mode shows limits and warns when one is passed", async () => {
    apiMock.challenges.mockResolvedValue({
      challenges: [
        {
          id: "c1",
          title: "No undo",
          difficulty: "easy",
          puzzleId: "t",
          objective: "Solve it without undo.",
          description: "",
          constraints: { maxActions: 5, maxSeconds: null, maxUndos: 0 },
        },
      ],
    });
    const user = userEvent.setup();
    renderPlayground("/play/t?challenge=c1");
    expect(await screen.findByRole("heading", { level: 1, name: "No undo" })).toBeInTheDocument();
    expect(screen.getByText(/Undos 0 \/ 0/)).toBeInTheDocument();
    await place(user, "A");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText(/A limit has been passed/)).toBeInTheDocument();
    // challenge attempts never restore or save free-play state
    expect(window.localStorage.getItem("edison:game:t")).toBeNull();
  });
});

describe("Playground verification races", () => {
  it("ignores a late server answer for a run the player already discarded", async () => {
    let late!: (v: unknown) => void;
    apiMock.submitAttempt.mockImplementationOnce(() => new Promise((r) => (late = r)));
    const user = userEvent.setup();
    renderPlayground();
    await screen.findByRole("heading", { level: 1 });
    const finish = async () => {
      await place(user, "A");
      await place(user, "B", ["{ArrowDown}", "{ArrowDown}"]);
      await place(user, "C", ["{ArrowRight}", "{ArrowRight}"]);
    };
    await finish();
    await screen.findByText(/Checking your arrangement/);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await finish();
    expect(await screen.findByText(/server independently checked/)).toBeInTheDocument();
    await act(async () =>
      late({
        valid: false,
        validation: { valid: false, errors: [] },
        minimumActions: 0,
        attemptId: null,
        challenge: null,
      }),
    );
    expect(screen.getByText(/server independently checked/)).toBeInTheDocument();
    expect(screen.queryByText(/did not accept/)).toBeNull();
  });
});
