import { describe, expect, it } from "vitest";
import { memoryBackend } from "./memory";
import { ROOM_CAPACITY } from "./sanitize";
import type { RoomMeta } from "./types";

// Each test uses a unique room id since the backend shares a process-global map.
let n = 0;
const rid = () => `test-room-${n++}`;

const META = (over: Partial<RoomMeta> = {}): RoomMeta => ({
  id: rid(),
  name: "Maths",
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

describe("createRoom", () => {
  it("returns the meta as STORED, not as requested", async () => {
    // The API route echoes this back to the creator and archives it, so a
    // clamped duration or a defaulted name must not read back unclamped.
    const stored = await memoryBackend.createRoom(
      META({ name: "   ", subject: "x".repeat(200), durationSec: 9_999_999 })
    );
    expect(stored?.durationSec).toBe(8 * 3600);
    expect(stored?.name).toBe("Study session");
    expect(stored?.subject.length).toBe(60);
  });

  it("refuses an id that is already taken", async () => {
    const meta = META();
    expect(await memoryBackend.createRoom(meta)).not.toBeNull();
    expect(await memoryBackend.createRoom(meta)).toBeNull();
  });

  it("starts empty and stays off the feed until someone joins", async () => {
    const meta = await roomWith({ visibility: "public", institution: "EPFL" });
    const room = await memoryBackend.getRoom(meta.id);
    expect(room?.peerCount).toBe(0);
    expect(room?.institution).toBe("EPFL");
    const listed = await memoryBackend.listActiveRooms();
    expect(listed.find((r) => r.id === meta.id)).toBeUndefined();
  });
});

describe("announce", () => {
  it("refuses to conjure a room that was never created", async () => {
    // The whole point of routing creation through createRoom: a heartbeat
    // must not be able to bring a room into being at an id of its choosing,
    // nor reopen a dead link as somebody else's room.
    expect(
      await memoryBackend.announce({
        roomId: "never-created",
        peerId: "a",
        username: "A",
      })
    ).toBeNull();
  });

  it("registers a peer in an existing room", async () => {
    const meta = await roomWith({ name: "Maths" });
    const res = await memoryBackend.announce({
      roomId: meta.id,
      peerId: "alice",
      username: "Alice",
    });
    expect(res?.room.name).toBe("Maths");
    expect(res?.joined).toBe(true);
    expect(res?.peers.map((p) => p.peerId)).toEqual(["alice"]);
  });

  it("returns every peer to a later joiner (poll-less discovery)", async () => {
    const meta = await roomWith();
    await memoryBackend.announce({ roomId: meta.id, peerId: "a", username: "A" });
    const second = await memoryBackend.announce({
      roomId: meta.id,
      peerId: "b",
      username: "B",
    });
    expect(second?.peers.map((p) => p.peerId).sort()).toEqual(["a", "b"]);
  });

  it("cannot rewrite the room's identity", async () => {
    // Announce carries presence only — there is no field on it that could
    // change a room's name, timer or visibility after creation.
    const meta = await roomWith({ name: "Real", visibility: "public" });
    const res = await memoryBackend.announce({
      roomId: meta.id,
      peerId: "b",
      username: "B",
    });
    expect(res?.room.name).toBe("Real");
    expect(res?.room.visibility).toBe("public");
  });

  it("sanitizes the stored username", async () => {
    const meta = await roomWith();
    const res = await memoryBackend.announce({
      roomId: meta.id,
      peerId: "a",
      username: "z".repeat(100),
    });
    expect(res?.peers[0].username.length).toBe(30);
  });

  it("records per-peer status on each announce", async () => {
    const meta = await roomWith();
    const first = await memoryBackend.announce({
      roomId: meta.id,
      peerId: "a",
      username: "A",
      status: { muted: true, away: false, deep: false },
    });
    expect(first?.peers[0].status).toEqual({
      muted: true,
      away: false,
      deep: false,
      tint: "",
    });

    const second = await memoryBackend.announce({
      roomId: meta.id,
      peerId: "a",
      username: "A",
      status: { muted: false, away: true, deep: true, tint: "sarcelle" },
    });
    expect(second?.peers[0].status).toEqual({
      muted: false,
      away: true,
      deep: true,
      tint: "sarcelle",
    });
  });

  it("preserves joinedAt across re-announces", async () => {
    const meta = await roomWith();
    const first = await memoryBackend.announce({
      roomId: meta.id,
      peerId: "a",
      username: "A",
    });
    const joined = first?.peers[0].joinedAt;
    await new Promise((r) => setTimeout(r, 5));
    const second = await memoryBackend.announce({
      roomId: meta.id,
      peerId: "a",
      username: "A",
    });
    expect(second?.peers[0].joinedAt).toBe(joined);
  });
});

describe("capacity", () => {
  it("seats exactly ROOM_CAPACITY people and reports the refusal", async () => {
    const meta = await roomWith();
    for (let i = 0; i < ROOM_CAPACITY; i++) {
      const res = await memoryBackend.announce({
        roomId: meta.id,
        peerId: `p${i}`,
        username: `U${i}`,
      });
      expect(res?.joined).toBe(true);
    }
    const overflow = await memoryBackend.announce({
      roomId: meta.id,
      peerId: "one-too-many",
      username: "Late",
    });
    // Silence here would strand the newcomer in a room nobody can see them in.
    expect(overflow?.joined).toBe(false);
    expect(overflow?.peers.map((p) => p.peerId)).not.toContain("one-too-many");

    const room = await memoryBackend.getRoom(meta.id);
    expect(room?.peerCount).toBe(ROOM_CAPACITY);
    expect(room?.capacity).toBe(ROOM_CAPACITY);
  });

  it("lets an existing member heartbeat even when the room is full", async () => {
    const meta = await roomWith();
    for (let i = 0; i < ROOM_CAPACITY; i++) {
      await memoryBackend.announce({
        roomId: meta.id,
        peerId: `p${i}`,
        username: `U${i}`,
      });
    }
    // The cap must never evict someone who already holds a seat.
    const beat = await memoryBackend.announce({
      roomId: meta.id,
      peerId: "p0",
      username: "U0",
    });
    expect(beat?.joined).toBe(true);
    expect(beat?.peers).toHaveLength(ROOM_CAPACITY);
  });
});

describe("discovery", () => {
  it("keeps room metadata after the last peer leaves (grace window)", async () => {
    const meta = await roomWith();
    await memoryBackend.announce({ roomId: meta.id, peerId: "a", username: "A" });
    await memoryBackend.removePeer(meta.id, "a");
    const room = await memoryBackend.getRoom(meta.id);
    expect(room).not.toBeNull();
    expect(room?.peerCount).toBe(0);
  });

  it("hides empty rooms from the feed", async () => {
    const meta = await roomWith({ visibility: "public" });
    await memoryBackend.announce({ roomId: meta.id, peerId: "a", username: "A" });
    await memoryBackend.removePeer(meta.id, "a");
    const active = await memoryBackend.listActiveRooms();
    expect(active.find((r) => r.id === meta.id)).toBeUndefined();
  });

  it("keeps private rooms out of the feed but reachable by id", async () => {
    const meta = await roomWith({ visibility: "private" });
    await memoryBackend.announce({ roomId: meta.id, peerId: "a", username: "A" });
    const listed = await memoryBackend.listActiveRooms();
    expect(listed.find((r) => r.id === meta.id)).toBeUndefined();
    const room = await memoryBackend.getRoom(meta.id);
    expect(room?.visibility).toBe("private");
    expect(room?.peerCount).toBe(1);
  });

  it("flags the room deep when any peer is in Deep Focus", async () => {
    const meta = await roomWith();
    await memoryBackend.announce({ roomId: meta.id, peerId: "a", username: "A" });
    expect((await memoryBackend.getRoom(meta.id))?.deep).toBe(false);
    await memoryBackend.announce({
      roomId: meta.id,
      peerId: "b",
      username: "B",
      status: { deep: true },
    });
    expect((await memoryBackend.getRoom(meta.id))?.deep).toBe(true);
  });

  it("counts active peers across all rooms, private included", async () => {
    const before = await memoryBackend.countActivePeers();
    const a = await roomWith({ visibility: "public" });
    const b = await roomWith({ visibility: "private" });
    await memoryBackend.announce({ roomId: a.id, peerId: "p1", username: "U1" });
    await memoryBackend.announce({ roomId: a.id, peerId: "p2", username: "U2" });
    await memoryBackend.announce({ roomId: b.id, peerId: "p3", username: "U3" });
    expect((await memoryBackend.countActivePeers()) - before).toBe(3);
  });
});
