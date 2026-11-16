import type { Placement } from "@shared/edison";
import { canRotate, checkPlacement, coveredArea, freeRects, orientedSize, pieceLabel } from "./geometry";

const board = { width: 6, height: 4 };
const P = (pieceId: string, x: number, y: number, width: number, height: number): Placement => ({
  pieceId,
  x,
  y,
  width,
  height,
  rotated: false,
});

describe("checkPlacement", () => {
  it("accepts a piece that exactly touches the board edges", () => {
    expect(checkPlacement(board, [], { pieceId: "a", x: 3, y: 2, width: 3, height: 2 })).toEqual({
      ok: true,
    });
  });
  it.each([
    [4, 0, 3, 1], // one cell past the right edge
    [0, 3, 1, 2], // one cell past the bottom edge
    [-1, 0, 2, 2],
    [0, -1, 2, 2],
  ])("rejects out of bounds at (%i,%i) %ix%i", (x, y, width, height) => {
    expect(checkPlacement(board, [], { pieceId: "a", x, y, width, height })).toEqual({
      ok: false,
      reason: "out_of_bounds",
    });
  });
  it("reports which piece blocks an overlap", () => {
    const r = checkPlacement(board, [P("b", 0, 0, 3, 2)], { pieceId: "a", x: 2, y: 1, width: 2, height: 2 });
    expect(r).toEqual({ ok: false, reason: "overlap", blockedBy: "b" });
  });
  it("treats shared edges as not overlapping", () => {
    const placed = [P("b", 0, 0, 3, 2)];
    expect(checkPlacement(board, placed, { pieceId: "a", x: 3, y: 0, width: 3, height: 2 }).ok).toBe(true);
    expect(checkPlacement(board, placed, { pieceId: "a", x: 0, y: 2, width: 3, height: 2 }).ok).toBe(true);
  });
  it("ignores the candidate's own existing placement (moving a piece)", () => {
    expect(
      checkPlacement(board, [P("a", 0, 0, 3, 2)], { pieceId: "a", x: 1, y: 0, width: 3, height: 2 }).ok,
    ).toBe(true);
  });
  it("detects a single shared cell", () => {
    const r = checkPlacement(board, [P("b", 0, 0, 3, 2)], { pieceId: "a", x: 2, y: 1, width: 1, height: 1 });
    expect(r.ok).toBe(false);
  });
});

describe("helpers", () => {
  it("covers area", () => expect(coveredArea([P("a", 0, 0, 3, 2), P("b", 3, 0, 1, 4)])).toBe(10));
  it("orients", () =>
    expect(orientedSize({ id: "a", width: 3, height: 5 }, true)).toEqual({ width: 5, height: 3 }));
  it("rotation rules", () => {
    expect(canRotate({ allowRotation: true }, { id: "a", width: 2, height: 3 })).toBe(true);
    expect(canRotate({ allowRotation: true }, { id: "a", width: 3, height: 3 })).toBe(false);
    expect(canRotate({ allowRotation: false }, { id: "a", width: 2, height: 3 })).toBe(false);
  });
  it("labels", () => {
    expect([0, 1, 25, 26, 27].map(pieceLabel)).toEqual(["A", "B", "Z", "AA", "AB"]);
  });
});

describe("freeRects", () => {
  it("covers exactly the free cells", () => {
    const placed = [P("a", 1, 1, 2, 2), P("b", 4, 0, 2, 3)];
    const cells = new Set<string>();
    for (const r of freeRects(board, placed))
      for (let y = r.y; y < r.y + r.height; y++)
        for (let x = r.x; x < r.x + r.width; x++) {
          expect(cells.has(`${x},${y}`)).toBe(false); // no double counting
          cells.add(`${x},${y}`);
        }
    expect(cells.size).toBe(board.width * board.height - coveredArea(placed));
    for (const p of placed) expect(cells.has(`${p.x},${p.y}`)).toBe(false);
  });
  it("full board has none, empty board is one rect", () => {
    expect(freeRects(board, [P("a", 0, 0, 6, 4)])).toEqual([]);
    expect(freeRects(board, [])).toEqual([{ x: 0, y: 0, width: 6, height: 4 }]);
  });
});
