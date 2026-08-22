import { describe, expect, it } from "vitest";
import { memoryBackend } from "./memory";
import type { RoomMeta } from "./types";

// The guard checks (verification / taken) and the one-call feed, exercised on
// the memory backend — same contract as Redis/Mongo. Unique ids per test: the
// backend shares a process-global map.
let n = 0;
const rid = () => `guard-room-${n++}`;

const META = (over: Partial<RoomMeta> = {}): RoomMeta => ({
  id: rid(),
  name: "Analyse II",
  subject: "",
  durationSec: 1500,
  startedAt: Date.now(),
  visibility: "private",
  institution: "",
  ...over,
});

async function roomWith(over: Partial<RoomMeta> = {}) {
  const meta = await memoryBackend.createRoom(META(over));
  if (!meta) throw new Error("createRoom refused");
  return meta;
}

const VERIFIED = { callerVerified: true, peerTokenValid: false };
const ANON = { callerVerified: false, peerTokenValid: false };
const MEMBER = { callerVerified: false, peerTokenValid: true };

describe("announce guard: verification", () => {
  it("refuses an unverified caller on a public room, without seating them", async () => {
    const meta = await roomWith({ visibility: "public" });
    const res = await memoryBackend.announce(
      { roomId: meta.id, peerId: "p1", username: "eve" },
      ANON
    );
    expect(res?.refused).toBe("verification");
    expect(res?.joined).toBe(false);
    expect(await memoryBackend.listPeers(meta.id)).toHaveLength(0);
  });

  it("seats a verified caller on a public room", async () => {
    const meta = await roomWith({ visibility: "public" });
    const res = await memoryBackend.announce(
      { roomId: meta.id, peerId: "p1", username: "alice" },
      VERIFIED
    );
    expect(res?.refused).toBeUndefined();
    expect(res?.joined).toBe(true);
  });

  it("seats an unverified caller on a private room (the code is the door)", async () => {
    const meta = await roomWith({ visibility: "private" });
    const res = await memoryBackend.announce(
      { roomId: meta.id, peerId: "p1", username: "bob" },
      ANON
    );
    expect(res?.refused).toBeUndefined();
    expect(res?.joined).toBe(true);
  });
});

describe("announce guard: taken", () => {
  it("refuses re-announcing an existing id without its token", async () => {
    const meta = await roomWith();
    await memoryBackend.announce(
      { roomId: meta.id, peerId: "p1", username: "alice" },
      ANON
    );
    const res = await memoryBackend.announce(
      { roomId: meta.id, peerId: "p1", username: "mallory" },
      ANON
    );
    expect(res?.refused).toBe("taken");
    // The rightful entry is untouched.
    const peers = await memoryBackend.listPeers(meta.id);
    expect(peers).toHaveLength(1);
    expect(peers[0].username).toBe("alice");
  });

  it("lets the token holder keep heartbeating its own id", async () => {
    const meta = await roomWith();
    await memoryBackend.announce(
      { roomId: meta.id, peerId: "p1", username: "alice" },
      ANON
    );
    const res = await memoryBackend.announce(
      { roomId: meta.id, peerId: "p1", username: "alice" },
      MEMBER
    );
    expect(res?.refused).toBeUndefined();
    expect(res?.joined).toBe(true);
  });

  it("without a guard (legacy callers), behaves as before", async () => {
    const meta = await roomWith();
    await memoryBackend.announce({
      roomId: meta.id,
      peerId: "p1",
      username: "alice",
    });
    const res = await memoryBackend.announce({
      roomId: meta.id,
      peerId: "p1",
      username: "alice2",
    });
    expect(res?.refused).toBeUndefined();
    expect(res?.joined).toBe(true);
  });
});

describe("getFeed", () => {
  it("returns the public rooms and the visibility-blind active count", async () => {
    const pub = await roomWith({ visibility: "public" });
    const priv = await roomWith({ visibility: "private" });
    await memoryBackend.announce(
      { roomId: pub.id, peerId: "a", username: "A" },
      VERIFIED
    );
    await memoryBackend.announce(
      { roomId: priv.id, peerId: "b", username: "B" },
      ANON
    );

    const feed = await memoryBackend.getFeed();
    const ids = feed.rooms.map((r) => r.id);
    expect(ids).toContain(pub.id);
    expect(ids).not.toContain(priv.id);
    // Counter counts BOTH occupants — it is visibility-blind on purpose.
    expect(feed.activeUsers).toBeGreaterThanOrEqual(2);
  });

  it("hides a public room with nobody in it", async () => {
    const pub = await roomWith({ visibility: "public" });
    const feed = await memoryBackend.getFeed();
    expect(feed.rooms.map((r) => r.id)).not.toContain(pub.id);
  });
});
