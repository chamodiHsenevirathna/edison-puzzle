import type { Puzzle } from "@shared/edison";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PieceTray } from "./PieceTray";

const puzzle: Puzzle = {
  id: "t",
  name: "t",
  board: { width: 4, height: 4 },
  allowRotation: true,
  pieces: [
    { id: "a", width: 4, height: 2 },
    { id: "b", width: 2, height: 2 },
  ],
};

describe("PieceTray", () => {
  it("lists unplaced pieces as buttons named by their label and size", () => {
    render(
      <PieceTray puzzle={puzzle} placements={[]} selectedId={null} trayRotated={{}} onSelect={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /Piece A 4×2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Piece B 2×2/ })).toBeInTheDocument();
  });
  it("omits placed pieces and says when none remain", () => {
    const placed = [
      { pieceId: "a", x: 0, y: 0, width: 4, height: 2, rotated: false },
      { pieceId: "b", x: 0, y: 2, width: 2, height: 2, rotated: false },
    ];
    render(
      <PieceTray
        puzzle={puzzle}
        placements={placed}
        selectedId={null}
        trayRotated={{}}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("All pieces are on the board.")).toBeInTheDocument();
  });
  it("reports selection with aria-pressed and calls onSelect from mouse and keyboard", async () => {
    const onSelect = vi.fn();
    render(<PieceTray puzzle={puzzle} placements={[]} selectedId="b" trayRotated={{}} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /Piece B/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Piece A/ })).toHaveAttribute("aria-pressed", "false");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Piece A/ }));
    screen.getByRole("button", { name: /Piece B/ }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });
  it("shows the rotated size for a rotated tray piece", () => {
    render(
      <PieceTray
        puzzle={puzzle}
        placements={[]}
        selectedId={null}
        trayRotated={{ a: true }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Piece A 2×4 rotated/ })).toBeInTheDocument();
  });
});
