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
});
