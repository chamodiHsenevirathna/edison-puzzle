import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { apiMock, resetApiMock, TEST_PUZZLE } from "../test/mockApi";
import { Creator } from "./Creator";

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

const OK = {
  canSave: true,
  solvability: "unknown",
  boardArea: 96,
  piecesArea: 96,
  areaDifference: 0,
  issues: [],
};
const SHORT = {
  canSave: false,
  solvability: "impossible",
  boardArea: 96,
  piecesArea: 72,
  areaDifference: -24,
  issues: [
    {
      severity: "error",
      code: "area_too_small",
      message:
        "The pieces cover 72 cells but the board has 96: 24 cells short, so the board can never be completely covered.",
    },
  ],
};

beforeEach(() => {
  resetApiMock();
  apiMock.analyze.mockResolvedValue(OK);
  apiMock.puzzles.mockResolvedValue({ puzzles: [] });
});

const setup = () =>
  render(
    <MemoryRouter>
      <Creator />
    </MemoryRouter>,
  );

describe("Creator", () => {
  it("computes the area balance locally and instantly", async () => {
    setup();
    expect(await screen.findByText(/The checks pass\./)).toBeInTheDocument();
    expect(screen.getAllByText("96")).toHaveLength(2); // pieces cover 96, board has 96
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove piece C" }));
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("−24")).toBeInTheDocument();
  });

  it("shows the server's explanation and blocks saving when the puzzle is invalid", async () => {
    apiMock.analyze.mockResolvedValue(SHORT);
    setup();
    expect(await screen.findByText(/24 cells short/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save puzzle" })).toBeDisabled();
  });

  it("sends the edited definition to the server for analysis (debounced)", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText(/The checks pass\./);
    apiMock.analyze.mockClear();
    const w = screen.getByLabelText("Width (cells)");
    await user.clear(w);
    await user.type(w, "20");
    await waitFor(() => expect(apiMock.analyze).toHaveBeenCalled());
    const last = apiMock.analyze.mock.calls.at(-1)![0];
    expect(last.board).toEqual({ width: 20, height: 8 });
    expect(last.pieces).toEqual([
      { width: 6, height: 8 },
      { width: 6, height: 4 },
      { width: 6, height: 4 },
    ]);
    expect(apiMock.analyze.mock.calls.length).toBeLessThan(4); // typing did not fire a request per keystroke
  });

  it("sends non-numeric input as null so the server can name the problem", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText(/The checks pass\./);
    apiMock.analyze.mockClear();
    const w = screen.getByLabelText("Width (cells)");
    await user.clear(w);
    await waitFor(() => expect(apiMock.analyze).toHaveBeenCalled());
    expect(apiMock.analyze.mock.calls.at(-1)![0].board.width).toBeNull();
    expect(w).toHaveAttribute("aria-invalid", "true");
  });

  it("saves, then offers play and solve", async () => {
    apiMock.createPuzzle.mockResolvedValue({ ...TEST_PUZZLE, id: "c-1", name: "My puzzle" });
    const user = userEvent.setup();
    setup();
    await screen.findByText(/The checks pass\./);
    await user.click(screen.getByRole("button", { name: "Save puzzle" }));
    expect(await screen.findByText(/Saved\. It is now available/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play it" })).toHaveAttribute("href", "/play/c-1");
    expect(apiMock.createPuzzle).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My puzzle", allowRotation: true }),
    );
  });

  it("surfaces a server rejection on save", async () => {
    const { ApiError } = await import("../api/client");
    apiMock.createPuzzle.mockRejectedValue(
      new ApiError(409, "limit_exceeded", "At most 200 custom puzzles can be stored. Delete one first."),
    );
    const user = userEvent.setup();
    setup();
    await screen.findByText(/The checks pass\./);
    await user.click(screen.getByRole("button", { name: "Save puzzle" }));
    expect(await screen.findByText(/At most 200 custom puzzles/)).toBeInTheDocument();
  });

  it("reports solver outcomes honestly: solved, none exists, and inconclusive", async () => {
    apiMock.createPuzzle.mockResolvedValue({ ...TEST_PUZZLE, id: "c-1", name: "My puzzle" });
    const metrics = { nodesVisited: 10, elapsedMs: 1 };
    const user = userEvent.setup();
    setup();
    await screen.findByText(/The checks pass\./);
    await user.click(screen.getByRole("button", { name: "Save puzzle" }));
    const ask = await screen.findByRole("button", { name: "Ask the solver" });

    apiMock.solve.mockResolvedValueOnce({ status: "exhausted", solutions: [], metrics });
    await user.click(ask);
    expect(await screen.findByText(/No solution exists/)).toBeInTheDocument();

    apiMock.solve.mockResolvedValueOnce({ status: "time_limit", solutions: [], metrics });
    await user.click(ask);
    expect(await screen.findByText(/Inconclusive.*does not prove/)).toBeInTheDocument();

    apiMock.solve.mockResolvedValueOnce({
      status: "max_solutions",
      solutions: [{ puzzleId: "c-1", placements: [] }],
      metrics,
    });
    await user.click(ask);
    expect(await screen.findByText(/Solved: the solver found/)).toBeInTheDocument();
  });

  it("lists saved puzzles and deletes one after confirmation", async () => {
    apiMock.puzzles.mockResolvedValue({
      puzzles: [
        {
          id: "c-9",
          name: "Old one",
          board: { width: 4, height: 4 },
          pieceCount: 3,
          allowRotation: true,
          builtIn: false,
        },
      ],
    });
    apiMock.deletePuzzle.mockResolvedValue(undefined);
    const user = userEvent.setup();
    setup();
    expect(await screen.findByText("Old one")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete Old one" }));
    expect(apiMock.deletePuzzle).not.toHaveBeenCalled(); // needs confirmation
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(apiMock.deletePuzzle).toHaveBeenCalledWith("c-9");
  });

  it("loads a saved puzzle into the editor as a copy", async () => {
    apiMock.puzzles.mockResolvedValue({
      puzzles: [
        {
          id: "c-9",
          name: "Old one",
          board: { width: 4, height: 4 },
          pieceCount: 3,
          allowRotation: true,
          builtIn: false,
        },
      ],
    });
    window.scrollTo = vi.fn();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole("button", { name: "Edit a copy of Old one" }));
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Test puzzle (copy)"));
    expect(screen.getByLabelText("Width (cells)")).toHaveValue(4);
  });

  it("caps the number of pieces at the server limit", async () => {
    apiMock.limits.mockResolvedValue({ maxBoardSide: 100, maxPieces: 3, maxCustomPuzzles: 200, solver: {} });
    setup();
    await act(async () => {});
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Add piece" })).toBeDisabled());
  });
});

describe("Creator races", () => {
  it("ignores an older analysis that resolves after a newer one", async () => {
    let first!: (v: unknown) => void;
    apiMock.analyze.mockReset();
    apiMock.analyze.mockImplementationOnce(() => new Promise((r) => (first = r)));
    apiMock.analyze.mockResolvedValue(SHORT);
    const user = userEvent.setup();
    setup();
    await waitFor(() => expect(apiMock.analyze).toHaveBeenCalledTimes(1));
    await user.type(screen.getByLabelText("Name"), "x");
    expect(await screen.findByText(/24 cells short/)).toBeInTheDocument();
    await act(async () => first(OK)); // stale, must be discarded
    expect(screen.getByText(/24 cells short/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save puzzle" })).toBeDisabled();
  });

  it("disables saving while the analysis is out of date with the edited form", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText(/The checks pass\./);
    expect(screen.getByRole("button", { name: "Save puzzle" })).toBeEnabled();
    apiMock.analyze.mockReturnValue(new Promise(() => {}));
    await user.type(screen.getByLabelText("Name"), "x");
    expect(screen.getByRole("button", { name: "Save puzzle" })).toBeDisabled();
  });

  it("submits only once on a double click", async () => {
    apiMock.createPuzzle.mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ ...TEST_PUZZLE, id: "c-1" }), 20)),
    );
    const user = userEvent.setup();
    setup();
    await screen.findByText(/The checks pass\./);
    const btn = screen.getByRole("button", { name: "Save puzzle" });
    await user.dblClick(btn);
    await screen.findByText(/Saved\. It is now available/);
    expect(apiMock.createPuzzle).toHaveBeenCalledTimes(1);
  });

  it("does not show Saved for an old definition when the form was edited during the save", async () => {
    let done!: (v: unknown) => void;
    apiMock.createPuzzle.mockImplementation(() => new Promise((r) => (done = r)));
    const user = userEvent.setup();
    setup();
    await screen.findByText(/The checks pass\./);
    await user.click(screen.getByRole("button", { name: "Save puzzle" }));
    await user.type(screen.getByLabelText("Name"), "x");
    await act(async () => done({ ...TEST_PUZZLE, id: "c-1" }));
    expect(screen.queryByText(/Saved\. It is now available/)).toBeNull();
  });
});
