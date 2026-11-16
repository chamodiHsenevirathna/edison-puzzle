import type { PuzzleDetail } from "@shared/api";
import { vi } from "vitest";

/** 4x4 board: A 4x2, B 2x2, C 2x2 (area 16). */
export const TEST_PUZZLE: PuzzleDetail = {
  id: "t",
  name: "Test puzzle",
  board: { width: 4, height: 4 },
  allowRotation: true,
  builtIn: false,
  piecesArea: 16,
  boardArea: 16,
  areaBalanced: true,
  pieces: [
    { id: "a", width: 4, height: 2 },
    { id: "b", width: 2, height: 2 },
    { id: "c", width: 2, height: 2 },
  ],
};

export const apiMock = {
  limits: vi.fn(),
  puzzles: vi.fn(),
  puzzle: vi.fn(),
  analyze: vi.fn(),
  createPuzzle: vi.fn(),
  deletePuzzle: vi.fn(),
  solve: vi.fn(),
  validate: vi.fn(),
  solutions: vi.fn(),
  challenges: vi.fn(),
  submitAttempt: vi.fn(),
  progress: vi.fn(),
};

export function resetApiMock() {
  for (const f of Object.values(apiMock)) f.mockReset();
  apiMock.puzzle.mockResolvedValue(TEST_PUZZLE);
  apiMock.puzzles.mockResolvedValue({
    puzzles: [
      {
        id: "t",
        name: "Test puzzle",
        board: { width: 4, height: 4 },
        pieceCount: 3,
        allowRotation: true,
        builtIn: false,
      },
    ],
  });
  apiMock.limits.mockResolvedValue({ maxBoardSide: 100, maxPieces: 30, maxCustomPuzzles: 200, solver: {} });
  apiMock.progress.mockResolvedValue({ puzzles: {}, challenges: {} });
}
