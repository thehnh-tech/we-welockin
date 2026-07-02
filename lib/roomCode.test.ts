import { describe, expect, it } from "vitest";
import { displayRoomCode, generateRoomId, normalizeRoomCode } from "./roomCode";

describe("generateRoomId", () => {
  it("produces focus-XXXXX ids from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateRoomId();
      expect(id).toMatch(/^focus-[abcdefghjkmnpqrstuvwxyz23456789]{5}$/);
    }
  });
});

describe("normalizeRoomCode", () => {
  it("accepts the display form", () => {
    expect(normalizeRoomCode("FOCUS-7Q2X")).toBe("focus-7q2x");
  });
  it("accepts the bare suffix", () => {
    expect(normalizeRoomCode("7Q2XZ")).toBe("focus-7q2xz");
  });
  it("accepts sloppy spacing/underscores", () => {
    expect(normalizeRoomCode(" focus_7q2x ")).toBe("focus-7q2x");
  });
  it("keeps legacy 6-char ids as-is", () => {
    expect(normalizeRoomCode("abc123")).toBe("abc123");
  });
  it("rejects empty and garbage", () => {
    expect(normalizeRoomCode("")).toBeNull();
    expect(normalizeRoomCode("   ")).toBeNull();
    expect(normalizeRoomCode("!!!!")).toBeNull();
    expect(normalizeRoomCode("x".repeat(50))).toBeNull();
  });
});

describe("displayRoomCode", () => {
  it("uppercases the id", () => {
    expect(displayRoomCode("focus-7q2x")).toBe("FOCUS-7Q2X");
    expect(displayRoomCode("abc123")).toBe("ABC123");
  });
});
