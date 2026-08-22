import { describe, expect, it } from "vitest";
import { memoryBackend } from "./memory";

// Each test uses a unique room id since the backend shares a process-global map.
let n = 0;
const rid = () => `test-room-${n++}`;

describe("memoryBackend", () => {
  it("creates a room on first announce and returns the peer", async () => {
    const id = rid();
    const { peers, room } = await memoryBackend.announce({
      roomId: id,
      peerId: "alice",
      username: "Alice",
      name: "Maths",
      durationSec: 1500,
      startedAt: Date.now(),
    });
    expect(room.name).toBe("Maths");
    expect(room.durationSec).toBe(1500);
    expect(peers.map((p) => p.peerId)).toEqual(["alice"]);
  });

  it("returns every peer to a later joiner (poll-less discovery)", async () => {
    const id = rid();
    await memoryBackend.announce({ roomId: id, peerId: "a", username: "A" });
    const second = await memoryBackend.announce({
      roomId: id,
      peerId: "b",
      username: "B",
    });
    expect(second.peers.map((p) => p.peerId).sort()).toEqual(["a", "b"]);
  });

  it("clamps a hostile duration and ignores later metadata changes", async () => {
    const id = rid();
    const first = await memoryBackend.announce({
      roomId: id,
      peerId: "a",
      username: "A",
      name: "Real",
      durationSec: 9_999_999,
    });
    expect(first.room.durationSec).toBe(8 * 3600);
    // A second announce must not be able to rewrite the room's metadata.
    const second = await memoryBackend.announce({
      roomId: id,
      peerId: "b",
      username: "B",
      name: "Hijacked",
      durationSec: 60,
    });
    expect(second.room.name).toBe("Real");
    expect(second.room.durationSec).toBe(8 * 3600);
  });

  it("keeps room metadata after the last peer leaves (grace window)", async () => {
    const id = rid();
    await memoryBackend.announce({ roomId: id, peerId: "a", username: "A" });
    await memoryBackend.removePeer(id, "a");
    const room = await memoryBackend.getRoom(id);
    expect(room).not.toBeNull();
    expect(room?.peerCount).toBe(0);
  });

  it("hides empty rooms from discovery", async () => {
    const id = rid();
    await memoryBackend.announce({ roomId: id, peerId: "a", username: "A" });
    await memoryBackend.removePeer(id, "a");
    const active = await memoryBackend.listActiveRooms();
    expect(active.find((r) => r.id === id)).toBeUndefined();
  });

  it("sanitizes the stored username", async () => {
    const id = rid();
    const { peers } = await memoryBackend.announce({
      roomId: id,
      peerId: "a",
      username: "z".repeat(100),
    });
    expect(peers[0].username.length).toBe(30);
  });

  it("stores subject on creation and per-peer status on each announce", async () => {
    const id = rid();
    const first = await memoryBackend.announce({
      roomId: id,
      peerId: "a",
      username: "A",
      subject: "Algorithmes",
      status: { muted: true, away: false, deep: false },
    });
    expect(first.room.subject).toBe("Algorithmes");
    expect(first.peers[0].status).toEqual({
      muted: true,
      away: false,
      deep: false,
      tint: "",
    });

    const second = await memoryBackend.announce({
      roomId: id,
      peerId: "a",
      username: "A",
      status: { muted: false, away: true, deep: true, tint: "sarcelle" },
    });
    expect(second.peers[0].status).toEqual({
      muted: false,
      away: true,
      deep: true,
      tint: "sarcelle",
    });
  });

  it("preserves joinedAt across re-announces", async () => {
    const id = rid();
    const first = await memoryBackend.announce({
      roomId: id,
      peerId: "a",
      username: "A",
    });
    const joined = first.peers[0].joinedAt;
    await new Promise((r) => setTimeout(r, 5));
    const second = await memoryBackend.announce({
      roomId: id,
      peerId: "a",
      username: "A",
    });
    expect(second.peers[0].joinedAt).toBe(joined);
  });

  it("flags the room deep when any peer is in Deep Focus", async () => {
    const id = rid();
    await memoryBackend.announce({ roomId: id, peerId: "a", username: "A" });
    let room = await memoryBackend.getRoom(id);
    expect(room?.deep).toBe(false);
    await memoryBackend.announce({
      roomId: id,
      peerId: "b",
      username: "B",
      status: { deep: true },
    });
    room = await memoryBackend.getRoom(id);
    expect(room?.deep).toBe(true);
  });

  it("keeps private rooms out of discovery but reachable by id", async () => {
    const id = rid();
    await memoryBackend.announce({
      roomId: id,
      peerId: "a",
      username: "A",
      visibility: "private",
    });
    const listed = await memoryBackend.listActiveRooms();
    expect(listed.find((r) => r.id === id)).toBeUndefined();
    const room = await memoryBackend.getRoom(id);
    expect(room?.visibility).toBe("private");
    expect(room?.peerCount).toBe(1);
  });

  it("defaults visibility to private (fail-closed)", async () => {
    const id = rid();
    await memoryBackend.announce({ roomId: id, peerId: "a", username: "A" });
    const room = await memoryBackend.getRoom(id);
    expect(room?.visibility).toBe("private");
  });

  it("cannot flip a room's visibility after creation", async () => {
    const id = rid();
    await memoryBackend.announce({
      roomId: id,
      peerId: "a",
      username: "A",
      visibility: "public",
    });
    await memoryBackend.announce({
      roomId: id,
      peerId: "b",
      username: "B",
      visibility: "private",
    });
    const room = await memoryBackend.getRoom(id);
    expect(room?.visibility).toBe("public");
  });

  it("createRoom pre-creates an empty room and refuses a taken id", async () => {
    const id = rid();
    const meta = {
      id,
      name: "Feed room",
      subject: "Chimie",
      durationSec: 1500,
      startedAt: Date.now(),
      visibility: "public" as const,
      institution: "Swiss Federal Institute of Technology, Lausanne",
    };
    expect(await memoryBackend.createRoom(meta)).toMatchObject({
      id,
      name: "Feed room",
      visibility: "public",
    });
    expect(await memoryBackend.createRoom(meta)).toBeNull();

    const room = await memoryBackend.getRoom(id);
    expect(room?.visibility).toBe("public");
    expect(room?.institution).toBe(meta.institution);
    expect(room?.peerCount).toBe(0);

    // The pre-created meta must survive the creator's first announce.
    await memoryBackend.announce({
      roomId: id,
      peerId: "a",
      username: "A",
      name: "Hijacked",
      visibility: "private",
    });
    const after = await memoryBackend.getRoom(id);
    expect(after?.name).toBe("Feed room");
    expect(after?.visibility).toBe("public");
  });

  it("createRoom returns the meta as stored, not as requested", async () => {
    // The API route echoes this back to the creator and archives it, so a
    // clamped duration or a defaulted name must not read back unclamped.
    const stored = await memoryBackend.createRoom({
      id: rid(),
      name: "   ",
      subject: "x".repeat(200),
      durationSec: 9_999_999,
      startedAt: Date.now(),
      visibility: "public",
      institution: "EPFL",
    });
    expect(stored?.durationSec).toBe(8 * 3600);
    expect(stored?.name).toBe("Study session");
    expect(stored?.subject.length).toBe(60);
  });

  it("empty pre-created public rooms stay off the feed until someone joins", async () => {
    const id = rid();
    await memoryBackend.createRoom({
      id,
      name: "Ghost",
      subject: "",
      durationSec: 1500,
      startedAt: Date.now(),
      visibility: "public",
      institution: "X",
    });
    const listed = await memoryBackend.listActiveRooms();
    expect(listed.find((r) => r.id === id)).toBeUndefined();
  });

  it("counts active peers across all rooms, private included", async () => {
    const before = await memoryBackend.countActivePeers();
    const a = rid();
    const b = rid();
    await memoryBackend.announce({ roomId: a, peerId: "p1", username: "U1" });
    await memoryBackend.announce({ roomId: a, peerId: "p2", username: "U2" });
    await memoryBackend.announce({
      roomId: b,
      peerId: "p3",
      username: "U3",
      visibility: "private",
    });
    const after = await memoryBackend.countActivePeers();
    expect(after - before).toBe(3);
  });
});
