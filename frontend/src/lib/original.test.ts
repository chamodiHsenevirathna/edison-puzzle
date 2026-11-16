import { ORIGINAL_BOARD, ORIGINAL_PIECES } from "./original";

describe("original puzzle constants", () => {
  it("has the 12 specified rectangles", () => {
    expect(ORIGINAL_PIECES).toHaveLength(12);
    const key = (p: readonly [number, number]) => `${p[0]}x${p[1]}`;
    const counts = new Map<string, number>();
    ORIGINAL_PIECES.forEach((p) => counts.set(key(p), (counts.get(key(p)) ?? 0) + 1));
    expect(Object.fromEntries(counts)).toEqual({
      "28x14": 1,
      "21x18": 2,
      "21x14": 2,
      "32x11": 1,
      "32x10": 1,
      "28x7": 1,
      "28x6": 1,
      "17x14": 1,
      "14x4": 1,
      "10x7": 1,
    });
  });
  it("areas add up to the 56 x 56 board", () => {
    expect(ORIGINAL_PIECES.reduce((s, [w, h]) => s + w * h, 0)).toBe(3136);
    expect(ORIGINAL_BOARD ** 2).toBe(3136);
  });
});
