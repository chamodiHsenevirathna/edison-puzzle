import { formatDuration } from "./format";

describe("formatDuration", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatDuration(4_200)).toBe("0:04.2");
    expect(formatDuration(83_000)).toBe("1:23");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
  });
  it("never shows 60 seconds when rounding up near a minute", () => {
    expect(formatDuration(59_960)).toBe("1:00");
    expect(formatDuration(59_949)).toBe("0:59.9");
  });
  it("treats non-finite or negative input as zero", () => {
    expect(formatDuration(NaN)).toBe("0:00.0");
    expect(formatDuration(Infinity)).toBe("0:00.0");
    expect(formatDuration(-5)).toBe("0:00.0");
  });
});
