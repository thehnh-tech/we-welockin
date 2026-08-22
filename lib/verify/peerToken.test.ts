import { describe, expect, it } from "vitest";
import { signPeerToken, verifyPeerToken } from "./peerToken";

const SECRET = "test-secret";
const ROOM = "7q2xkm";
const PEER = "peer-abc-123";

describe("peer session token", () => {
  it("round-trips for the pair it was minted for", () => {
    const t = signPeerToken(ROOM, PEER, SECRET);
    expect(verifyPeerToken(ROOM, PEER, t, SECRET)).toBe(true);
  });

  it("does not transfer to another peer in the same room", () => {
    // The whole point: every member can read every other member's peer id
    // off the roster, so a token must not be derivable from one.
    const t = signPeerToken(ROOM, PEER, SECRET);
    expect(verifyPeerToken(ROOM, "someone-else", t, SECRET)).toBe(false);
  });

  it("does not transfer to another room", () => {
    const t = signPeerToken(ROOM, PEER, SECRET);
    expect(verifyPeerToken("other-room", PEER, t, SECRET)).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const t = signPeerToken(ROOM, PEER, "other-secret");
    expect(verifyPeerToken(ROOM, PEER, t, SECRET)).toBe(false);
  });

  it("rejects missing and malformed tokens without throwing", () => {
    expect(verifyPeerToken(ROOM, PEER, undefined, SECRET)).toBe(false);
    expect(verifyPeerToken(ROOM, PEER, null, SECRET)).toBe(false);
    expect(verifyPeerToken(ROOM, PEER, "", SECRET)).toBe(false);
    expect(verifyPeerToken(ROOM, PEER, "garbage", SECRET)).toBe(false);
    expect(verifyPeerToken(ROOM, PEER, "x".repeat(1000), SECRET)).toBe(false);
  });

  it("is URL-safe (it travels as a query parameter on leave)", () => {
    expect(signPeerToken(ROOM, PEER, SECRET)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
