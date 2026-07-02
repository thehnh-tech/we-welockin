import { describe, expect, it } from "vitest";
import { avatarColor, initials } from "./avatar";

describe("avatarColor", () => {
  it("is deterministic and returns a hex color", () => {
    expect(avatarColor("Hedi")).toBe(avatarColor("Hedi"));
    expect(avatarColor("Hedi")).toMatch(/^#[0-9a-f]{6}$/);
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
