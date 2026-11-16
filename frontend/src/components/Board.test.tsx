import type { Placement } from "@shared/edison";
import { render, screen } from "@testing-library/react";
import { Board } from "./Board";

const puzzle = {
  pieces: [
    { id: "a", width: 4, height: 2 },
    { id: "b", width: 2, height: 2 },
  ],
};
const P = (pieceId: string, x: number, y: number, width: number, height: number): Placement => ({
  pieceId,
  x,
  y,
  width,
  height,
  rotated: false,
});

describe("Board", () => {
  it("is exposed to assistive tech as a labelled image", () => {
    render(
      <Board
        board={{ width: 4, height: 4 }}
        puzzle={puzzle}
        placements={[]}
        ariaLabel="Board with 0 pieces placed"
      />,
    );
    expect(screen.getByRole("img", { name: "Board with 0 pieces placed" })).toBeInTheDocument();
  });
  it("draws one group per placed piece at the right geometry, with a letter label", () => {
    const { container } = render(
      <Board
        board={{ width: 4, height: 4 }}
        puzzle={puzzle}
        placements={[P("a", 0, 0, 4, 2), P("b", 2, 2, 2, 2)]}
        ariaLabel="b"
      />,
    );
    const a = container.querySelector('[data-piece="a"] rect.body');
    expect(a).toHaveAttribute("width", "4");
    expect(a).toHaveAttribute("height", "2");
    expect(container.querySelector('[data-piece="b"] rect.body')).toHaveAttribute("x", "2");
    expect(container.querySelectorAll("g.piece")).toHaveLength(2);
    expect(container.textContent).toContain("A");
  });
  it("hides labels on request", () => {
    const { container } = render(
      <Board
        board={{ width: 4, height: 4 }}
        puzzle={puzzle}
        placements={[P("a", 0, 0, 4, 2)]}
        showLabels={false}
        ariaLabel="b"
      />,
    );
    expect(container.querySelector(".lbl")).toBeNull();
  });
  it("shows a valid and an invalid ghost differently", () => {
    const { container, rerender } = render(
      <Board
        board={{ width: 4, height: 4 }}
        puzzle={puzzle}
        placements={[]}
        ghost={{ x: 0, y: 0, width: 2, height: 2, valid: true }}
        ariaLabel="b"
      />,
    );
    expect(container.querySelector(".ghost")).not.toHaveClass("invalid");
    rerender(
      <Board
        board={{ width: 4, height: 4 }}
        puzzle={puzzle}
        placements={[]}
        ghost={{ x: 0, y: 0, width: 2, height: 2, valid: false }}
        ariaLabel="b"
      />,
    );
    expect(container.querySelector(".ghost")).toHaveClass("invalid");
  });
  it("hatches only the free area (none when full)", () => {
    const full = render(
      <Board
        board={{ width: 4, height: 2 }}
        puzzle={puzzle}
        placements={[P("a", 0, 0, 4, 2)]}
        ariaLabel="b"
      />,
    );
    expect(full.container.querySelectorAll('rect[fill^="url(#hatch"]')).toHaveLength(0);
    const empty = render(
      <Board board={{ width: 4, height: 2 }} puzzle={puzzle} placements={[]} ariaLabel="b" />,
    );
    expect(empty.container.querySelectorAll('rect[fill^="url(#hatch"]')).toHaveLength(1);
  });
  it("marks rejected candidates with a cross", () => {
    const { container } = render(
      <Board
        board={{ width: 4, height: 4 }}
        puzzle={puzzle}
        placements={[]}
        candidate={{ placement: P("a", 0, 0, 4, 2), kind: "rejected" }}
        ariaLabel="b"
      />,
    );
    expect(container.querySelector("g.piece.rejected")).not.toBeNull();
    expect(container.querySelectorAll("g.piece.rejected line")).toHaveLength(2);
  });
  it("draws dimension lines only for the requested piece", () => {
    const { container } = render(
      <Board
        board={{ width: 8, height: 8 }}
        puzzle={puzzle}
        placements={[P("a", 2, 2, 4, 2)]}
        dimensionFor="a"
        ariaLabel="b"
      />,
    );
    const texts = [...container.querySelectorAll(".dim-text")].map((t) => t.textContent);
    expect(texts).toEqual(["4", "2"]);
  });
  it("labels ruler ticks with board coordinates", () => {
    const { container } = render(
      <Board board={{ width: 56, height: 56 }} puzzle={puzzle} placements={[]} ariaLabel="b" />,
    );
    const ticks = [...container.querySelectorAll(".ruler-text")].map((t) => t.textContent);
    expect(ticks).toEqual(expect.arrayContaining(["0", "8", "56"]));
  });
  it.each([
    [3, 3],
    [12, 8],
    [100, 100],
  ])("renders a valid viewBox and edge-labelled rulers on a %ix%i board", (width, height) => {
    const { container } = render(
      <Board
        board={{ width, height }}
        puzzle={puzzle}
        placements={[P("b", 0, 0, 2, 2)]}
        dimensionFor="b"
        ariaLabel="b"
      />,
    );
    const vb = container.querySelector("svg")?.getAttribute("viewBox")?.split(" ").map(Number) ?? [];
    expect(vb).toHaveLength(4);
    expect(vb.every(Number.isFinite)).toBe(true);
    expect(vb[2]).toBeGreaterThan(width);
    const ticks = [...container.querySelectorAll(".ruler-text")].map((t) => t.textContent);
    expect(ticks).toContain("0");
    expect(ticks).toContain(String(width));
    expect(container.querySelectorAll(".dim-text")).toHaveLength(2);
  });
});
