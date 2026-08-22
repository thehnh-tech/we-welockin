import { describe, expect, it } from "vitest";
import { displayRoomCode, generateRoomId, normalizeRoomCode } from "./roomCode";

describe("generateRoomId", () => {
  it("produces bare 6-char ids from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRoomId()).toMatch(
        /^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/
      );
    }
  });

  it("never emits characters that are easy to misread", () => {
    const ids = Array.from({ length: 200 }, generateRoomId).join("");
    expect(ids).not.toMatch(/[ilo01]/);
  });

  it("does not repeat itself (the code is a private room's only secret)", () => {
    const seen = new Set(Array.from({ length: 500 }, generateRoomId));
    expect(seen.size).toBe(500);
  });
});

describe("normalizeRoomCode", () => {
  it("accepts the display form", () => {
    expect(normalizeRoomCode("7Q2XKM")).toBe("7q2xkm");
  });

  it("accepts sloppy spacing, underscores and hyphens", () => {
    expect(normalizeRoomCode(" 7q2 xkm ")).toBe("7q2xkm");
    expect(normalizeRoomCode("7q2-xkm")).toBe("7q2xkm");
    expect(normalizeRoomCode("7Q2_XKM")).toBe("7q2xkm");
  });

  it("still resolves legacy focus- ids, prefix included", () => {
    // Rooms and shared links minted by earlier versions must keep working.
    expect(normalizeRoomCode("FOCUS-7Q2XZ")).toBe("focus-7q2xz");
    expect(normalizeRoomCode(" focus_7q2xz ")).toBe("focus-7q2xz");
  });

  it("keeps older bare ids as-is", () => {
    expect(normalizeRoomCode("abc123")).toBe("abc123");
  });

  it("rejects empty and garbage", () => {
    expect(normalizeRoomCode("")).toBeNull();
    expect(normalizeRoomCode("   ")).toBeNull();
    expect(normalizeRoomCode("!!!!")).toBeNull();
    expect(normalizeRoomCode("x".repeat(50))).toBeNull();
    expect(normalizeRoomCode("focus-")).toBeNull();
  });

  it("rejects path traversal and separators that could escape the route", () => {
    expect(normalizeRoomCode("../../etc/passwd")).toBeNull();
    expect(normalizeRoomCode("abc/def")).toBeNull();
    expect(normalizeRoomCode("abc.def")).toBeNull();
    expect(normalizeRoomCode("abc%2f")).toBeNull();
  });

  it("round-trips a generated id", () => {
    for (let i = 0; i < 20; i++) {
      const id = generateRoomId();
      expect(normalizeRoomCode(displayRoomCode(id))).toBe(id);
    }
  });
});

describe("displayRoomCode", () => {
  it("uppercases the id", () => {
    expect(displayRoomCode("7q2xkm")).toBe("7Q2XKM");
    expect(displayRoomCode("focus-7q2x")).toBe("FOCUS-7Q2X");
  });
});
