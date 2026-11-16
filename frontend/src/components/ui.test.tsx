import { render, screen } from "@testing-library/react";
import { ProgressBar } from "./ui";

describe("ProgressBar", () => {
  it("clamps to 0-100% and survives max 0", () => {
    const { rerender } = render(<ProgressBar value={9} max={4} label="p" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "100%");
    rerender(<ProgressBar value={1} max={0} label="p" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "0%");
  });
});
