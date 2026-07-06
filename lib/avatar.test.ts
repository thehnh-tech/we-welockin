import { describe, expect, it } from "vitest";
import { avatarTint, initials, TINTS, tintByKey } from "./avatar";

describe("avatarTint", () => {
  it("is deterministic and returns a charte tint", () => {
    expect(avatarTint("Hedi")).toBe(avatarTint("Hedi"));
    expect(TINTS).toContain(avatarTint("Hedi"));
    expect(avatarTint("Hedi").bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(avatarTint("Hedi").fg).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("tintByKey", () => {
  it("resolves known keys and rejects unknown ones", () => {
    expect(tintByKey("vert")?.fg).toBe("#54a078");
    expect(tintByKey("neon")).toBeNull();
    expect(tintByKey("")).toBeNull();
    expect(tintByKey(undefined)).toBeNull();
  });
});

describe("initials", () => {
  it("uses first + last word", () => {
    expect(initials("Mara Lindqvist")).toBe("ML");
    expect(initials("Jean Paul Dupont")).toBe("JD");
  });
  it("uses two letters of a single word", () => {
    expect(initials("hedi")).toBe("HE");
  });
  it("handles empty input", () => {
    expect(initials("   ")).toBe("?");
  });
});
