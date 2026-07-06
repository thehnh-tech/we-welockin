import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATION_SEC,
  sanitizeDuration,
  sanitizeName,
  sanitizePeerId,
  sanitizeStartedAt,
  sanitizeStatus,
  sanitizeSubject,
  sanitizeUsername,
} from "./sanitize";

const BELL = String.fromCharCode(7);
const NUL = String.fromCharCode(0);

describe("sanitizeName / sanitizeUsername", () => {
  it("strips control characters", () => {
    expect(sanitizeName("Evil" + BELL + NUL + "Name")).toBe("EvilName");
    expect(sanitizeUsername("a" + BELL + "b")).toBe("ab");
  });

  it("truncates to the max length", () => {
    expect(sanitizeName("x".repeat(100)).length).toBe(60);
    expect(sanitizeUsername("y".repeat(100)).length).toBe(30);
  });

  it("falls back to a default when empty", () => {
    expect(sanitizeName("   ")).toBe("Study session");
    expect(sanitizeUsername("")).toBe("Anon");
  });
});

describe("sanitizeDuration", () => {
  it("defaults when missing or non-finite", () => {
    expect(sanitizeDuration(undefined)).toBe(DEFAULT_DURATION_SEC);
    expect(sanitizeDuration(Number.NaN)).toBe(DEFAULT_DURATION_SEC);
  });

  it("clamps to [60, 8h]", () => {
    expect(sanitizeDuration(10)).toBe(60);
    expect(sanitizeDuration(999_999)).toBe(8 * 3600);
    expect(sanitizeDuration(1500)).toBe(1500);
  });
});

describe("sanitizeStartedAt", () => {
  const now = 1_000_000_000;
  const dur = 1500;

  it("never returns a future timestamp", () => {
    expect(sanitizeStartedAt(now + 50_000, dur, now)).toBe(now);
  });

  it("never returns further back than now - duration", () => {
    expect(sanitizeStartedAt(0, dur, now)).toBe(now - dur * 1000);
  });

  it("passes through a valid in-window value", () => {
    expect(sanitizeStartedAt(now - 1000, dur, now)).toBe(now - 1000);
  });

  it("defaults to now when non-finite", () => {
    expect(sanitizeStartedAt(Number.NaN, dur, now)).toBe(now);
  });
});

describe("sanitizePeerId", () => {
  it("truncates to 64 chars", () => {
    expect(sanitizePeerId("p".repeat(200)).length).toBe(64);
    expect(sanitizePeerId(undefined)).toBe("");
  });
});

describe("sanitizeSubject", () => {
  it("allows empty, strips control chars, truncates", () => {
    expect(sanitizeSubject(undefined)).toBe("");
    expect(sanitizeSubject("  ")).toBe("");
    expect(sanitizeSubject("Algo" + BELL + " P4")).toBe("Algo P4");
    expect(sanitizeSubject("s".repeat(100)).length).toBe(60);
  });
});

describe("sanitizeStatus", () => {
  it("coerces to strict booleans and defaults to false", () => {
    expect(sanitizeStatus(undefined)).toEqual({
      muted: false,
      away: false,
      deep: false,
      tint: "",
    });
    expect(sanitizeStatus({ muted: true, away: "yes", deep: 1 })).toEqual({
      muted: true,
      away: false,
      deep: false,
      tint: "",
    });
    expect(sanitizeStatus({ deep: true })).toEqual({
      muted: false,
      away: false,
      deep: true,
      tint: "",
    });
  });

  it("whitelists the tint key", () => {
    expect(sanitizeStatus({ tint: "vert" }).tint).toBe("vert");
    expect(sanitizeStatus({ tint: "neon" }).tint).toBe("");
    expect(sanitizeStatus({ tint: 42 }).tint).toBe("");
  });
});
