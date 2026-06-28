import { describe, expect, it } from "vitest";
import { formatClock } from "./time";

describe("formatClock", () => {
  it("pads minutes and seconds", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(5)).toBe("00:05");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(599)).toBe("09:59");
  });

  it("shows hours only when needed", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3661)).toBe("1:01:01");
  });

  it("floors fractional seconds and clamps negatives to zero", () => {
    expect(formatClock(65.9)).toBe("01:05");
    expect(formatClock(-10)).toBe("00:00");
  });
});
