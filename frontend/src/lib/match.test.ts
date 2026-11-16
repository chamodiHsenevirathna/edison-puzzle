import type { GallerySolution } from "@shared/api";
import type { Placement } from "@shared/edison";
import { matchSolution } from "./match";

const P = (id: string, x: number, y: number, w: number, h: number): Placement => ({
  pieceId: id,
  x,
  y,
  width: w,
  height: h,
  rotated: false,
});
const sol = (index: number, placements: Placement[]): GallerySolution => ({
  index,
  familyId: 0,
  canonical: index === 0,
  transform: "identity",
  transformLabel: "Identical",
  placements,
});

describe("matchSolution", () => {
  const known = [
    sol(0, [P("a", 0, 0, 2, 1), P("b", 0, 1, 2, 1)]),
    sol(1, [P("a", 0, 0, 1, 2), P("b", 1, 0, 1, 2)]),
  ];
  it("matches regardless of piece ids and order (interchangeable identical pieces)", () => {
    expect(matchSolution([P("y", 0, 1, 2, 1), P("x", 0, 0, 2, 1)], known)?.index).toBe(0);
  });
  it("returns null for an arrangement that is not in the list", () => {
    expect(matchSolution([P("a", 0, 0, 2, 1)], known)).toBeNull();
  });
});
