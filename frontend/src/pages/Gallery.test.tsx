import type { SolutionsResponse } from "@shared/api";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DEFAULT_PUZZLE } from "../lib/constants";
import { apiMock, resetApiMock, TEST_PUZZLE } from "../test/mockApi";
import { Gallery } from "./Gallery";

vi.mock("../api/client", async () => {
  const { apiMock } = await import("../test/mockApi");
  return { api: apiMock, ApiError: class extends Error {} };
});

const sol = (index: number, familyId: number) => ({
  index,
  familyId,
  canonical: false,
  transform: "t",
  transformLabel: "Turned",
  placements: [],
});
function data(over: Partial<SolutionsResponse>): SolutionsResponse {
  return {
    puzzleId: DEFAULT_PUZZLE,
    exhaustive: true,
    count: 2,
    familyCount: 2,
    boardSymmetries: 8,
    solutions: [sol(0, 0), sol(1, 1)],
    families: [0, 1].map((i) => ({
      familyId: i,
      canonicalIndex: i,
      distinctImages: 1,
      members: [{ solutionIndex: i, transform: "t", label: "Turned" }],
    })),
    ...over,
  };
}
function renderGallery(d: SolutionsResponse) {
  resetApiMock();
  apiMock.puzzle.mockResolvedValue({ ...TEST_PUZZLE, id: DEFAULT_PUZZLE });
  apiMock.solutions.mockResolvedValue(d);
  render(
    <MemoryRouter initialEntries={[`/solutions/${DEFAULT_PUZZLE}`]}>
      <Routes>
        <Route path="/solutions/:puzzleId" element={<Gallery />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Gallery symmetry claims", () => {
  it("does not claim a single family for the original puzzle when the data has several", async () => {
    renderGallery(data({}));
    await screen.findByText(/solution families/);
    expect(screen.queryByText(/single arrangement/)).toBeNull();
  });
  it("states the single-family claim from the data, with the real arrangement count", async () => {
    renderGallery(
      data({ count: 8, familyCount: 1, solutions: [sol(0, 0)], families: [data({}).families[0]!] }),
    );
    expect(await screen.findByText(/found 8 arrangements and every one/)).toBeTruthy();
  });
  it("does not call a non-square board square", async () => {
    renderGallery(data({ boardSymmetries: 4 }));
    await waitFor(() => expect(screen.getByText(/Rotations and reflections/)).toBeTruthy());
    expect(screen.queryByText(/square board/)).toBeNull();
    expect(screen.getByText(/in 4 ways/)).toBeTruthy();
  });
});
