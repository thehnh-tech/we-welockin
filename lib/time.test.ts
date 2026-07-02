import { describe, expect, it } from "vitest";
import { formatClock, formatDuration, formatHours } from "./time";

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

describe("formatDuration", () => {
  it("always shows an hours digit", () => {
    expect(formatDuration(0)).toBe("0:00:00");
    expect(formatDuration(3530)).toBe("0:58:50");
    expect(formatDuration(8091)).toBe("2:14:51");
  });
});

describe("formatHours", () => {
  it("formats compact h:mm", () => {
    expect(formatHours(0)).toBe("0:00");
    expect(formatHours(6120)).toBe("1:42");
    expect(formatHours(38 * 3600)).toBe("38:00");
  });
});
