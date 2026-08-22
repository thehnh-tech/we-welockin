// One suite, run against EVERY store backend.
//
// The app was built against the in-memory backend, but production runs a
// shared one â€” so "it works in memory" proves nothing about what students
// actually get. These assertions are the contract in lib/store/types.ts
// written out, so a backend that drifts from it fails here instead of in a
// study session.
//
// MongoDB runs in-process via mongodb-memory-server: a real mongod, so TTL
// indexes, unique constraints and upsert races behave as they will in Atlas.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MongoMemoryServer } from "mongodb-memory-server";
import { PEER_TIMEOUT_MS, ROOM_CAPACITY } from "./sanitize";
import type { RoomMeta, StoreBackend } from "./types";

type Backend = { name: string; backend: StoreBackend };

// Set up at module scope, not in beforeAll: describe.each is evaluated while
// the file is collected, long before any hook runs, so the backend list has
// to exist by then.
const backends: Backend[] = [];
let mongod: MongoMemoryServer | null = null;

const { memoryBackend } = await import("./memory");
backends.push({ name: "memory", backend: memoryBackend });

try {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = "welockin_contract_test";
  const { mongoBackend } = await import("./mongo");
  // Touch it once so the lazy client connects and the indexes are built
  // before the first assertion depends on them.
  await mongoBackend.listActiveRooms();
  backends.push({ name: "mongo", backend: mongoBackend });
} catch (err) {
  // A sandbox that cannot fetch the mongod binary should not turn the whole
  // suite red â€” but it must be loud, because Mongo is the backend that runs
  // in production. The guard test below fails if coverage silently degrades.
  console.warn(
    "\n[contract] MongoDB backend NOT covered in this run:",
    (err as Error)?.message,
    "\n"
  );
}

afterAll(async () => {
  await mongod?.stop();
});

it("covers the production backend, not just the in-memory one", () => {
  expect(backends.map((b) => b.name)).toContain("mongo");
});

let seq = 0;
const nextId = () => `ct${Date.now().toString(36)}${seq++}`;

const META = (over: Partial<RoomMeta> = {}): RoomMeta => ({
  id: nextId(),
  name: "Maths",
  subject: "",
  durationSec: 1500,
  startedAt: Date.now(),
  visibility: "private",
  institution: "",
  ...over,
});

describe.each(backends)("StoreBackend contract: $name", ({ backend }) => {
  {
    const store = () => backend;
    let room: RoomMeta;

    beforeEach(async () => {
      const created = await store().createRoom(META());
      if (!created) throw new Error("createRoom refused");
      room = created;
    });

    describe("createRoom", () => {
      it("returns the meta as stored, clamped and sanitized", async () => {
        const stored = await store().createRoom(
          META({
            name: "   ",
            subject: "x".repeat(200),
            durationSec: 9_999_999,
          })
        );
        expect(stored?.durationSec).toBe(8 * 3600);
        expect(stored?.name).toBe("Study session");
        expect(stored?.subject.length).toBe(60);
      });

      it("refuses an id that is already taken", async () => {
        const meta = META();
        expect(await store().createRoom(meta)).not.toBeNull();
        expect(await store().createRoom(meta)).toBeNull();
      });

      it("starts empty and off the feed", async () => {
        const pub = await store().createRoom(META({ visibility: "public" }));
        const got = await store().getRoom(pub!.id);
        expect(got?.peerCount).toBe(0);
        expect(got?.capacity).toBe(ROOM_CAPACITY);
        const listed = await store().listActiveRooms();
        expect(listed.find((r) => r.id === pub!.id)).toBeUndefined();
      });
    });

    describe("announce", () => {
      it("refuses to conjure a room that was never created", async () => {
        expect(
          await store().announce({
            roomId: nextId(),
            peerId: "a",
            username: "A",
          })
        ).toBeNull();
      });

      it("seats a peer and returns the stored room identity", async () => {
        const res = await store().announce({
          roomId: room.id,
          peerId: "alice",
          username: "Alice",
        });
        expect(res?.joined).toBe(true);
        expect(res?.room.name).toBe(room.name);
        expect(res?.room.visibility).toBe(room.visibility);
        expect(res?.peers.map((p) => p.peerId)).toEqual(["alice"]);
      });

      it("returns every peer to a later joiner", async () => {
        await store().announce({ roomId: room.id, peerId: "a", username: "A" });
        const second = await store().announce({
          roomId: room.id,
          peerId: "b",
          username: "B",
        });
        expect(second?.peers.map((p) => p.peerId).sort()).toEqual(["a", "b"]);
      });

      it("sanitizes the username and records status", async () => {
        const res = await store().announce({
          roomId: room.id,
          peerId: "a",
          username: "z".repeat(100),
          status: { muted: true, away: true, deep: true, tint: "sarcelle" },
        });
        expect(res?.peers[0].username.length).toBe(30);
        expect(res?.peers[0].status).toEqual({
          muted: true,
          away: true,
          deep: true,
          tint: "sarcelle",
        });
      });

      it("preserves joinedAt across re-announces", async () => {
        const first = await store().announce({
          roomId: room.id,
          peerId: "a",
          username: "A",
        });
        await new Promise((r) => setTimeout(r, 5));
        const second = await store().announce({
          roomId: room.id,
          peerId: "a",
          username: "A",
        });
        expect(second?.peers[0].joinedAt).toBe(first?.peers[0].joinedAt);
      });
    });

    describe("guards", () => {
      it("refuses an unverified caller on a public room, without touching it", async () => {
        const pub = (await store().createRoom(META({ visibility: "public" })))!;
        const res = await store().announce(
          { roomId: pub.id, peerId: "a", username: "A" },
          { callerVerified: false, peerTokenValid: false }
        );
        expect(res?.refused).toBe("verification");
        expect(res?.joined).toBe(false);
        // A refused caller must not appear anywhere.
        expect((await store().getRoom(pub.id))?.peerCount).toBe(0);
      });

      it("lets a verified caller into a public room", async () => {
        const pub = (await store().createRoom(META({ visibility: "public" })))!;
        const res = await store().announce(
          { roomId: pub.id, peerId: "a", username: "A" },
          { callerVerified: true, peerTokenValid: false }
        );
        expect(res?.refused).toBeUndefined();
        expect(res?.joined).toBe(true);
      });

      it("never asks for verification on a private room", async () => {
        const res = await store().announce(
          { roomId: room.id, peerId: "a", username: "A" },
          { callerVerified: false, peerTokenValid: false }
        );
        expect(res?.refused).toBeUndefined();
        expect(res?.joined).toBe(true);
      });

      it("refuses to hand a claimed peer id to someone who cannot prove it", async () => {
        await store().announce(
          { roomId: room.id, peerId: "victim", username: "Victim" },
          { callerVerified: false, peerTokenValid: true }
        );
        const steal = await store().announce(
          { roomId: room.id, peerId: "victim", username: "Mallory" },
          { callerVerified: false, peerTokenValid: false }
        );
        expect(steal?.refused).toBe("taken");
        // The victim's name must not have been overwritten.
        expect((await store().getRoom(room.id))?.peerNames).toEqual(["Victim"]);
      });

      it("lets the owner keep re-announcing its own id", async () => {
        await store().announce(
          { roomId: room.id, peerId: "mine", username: "Me" },
          { callerVerified: false, peerTokenValid: true }
        );
        const again = await store().announce(
          { roomId: room.id, peerId: "mine", username: "Me" },
          { callerVerified: false, peerTokenValid: true }
        );
        expect(again?.refused).toBeUndefined();
        expect(again?.joined).toBe(true);
      });

      it("still refuses after the seat has gone stale", async () => {
        // The one that matters, and the one the first version of this suite
        // missed: it stole the id microseconds after seating, so the entry was
        // always live and the liveness-gated backend looked correct. A real
        // attacker just waits — a locked phone is enough — so the clock has to
        // move. setSystemTime shifts Date only, leaving the driver's own
        // timers alone.
        await store().announce(
          { roomId: room.id, peerId: "idle", username: "Idle" },
          { callerVerified: false, peerTokenValid: true }
        );
        const realNow = Date.now();
        vi.setSystemTime(realNow + PEER_TIMEOUT_MS + 5_000);
        try {
          // The seat is free by now — but the id is still theirs.
          const steal = await store().announce(
            { roomId: room.id, peerId: "idle", username: "Mallory" },
            { callerVerified: false, peerTokenValid: false }
          );
          expect(steal?.refused).toBe("taken");

          // …and its owner can still come back with their token.
          const back = await store().announce(
            { roomId: room.id, peerId: "idle", username: "Idle" },
            { callerVerified: false, peerTokenValid: true }
          );
          expect(back?.refused).toBeUndefined();
          expect(back?.joined).toBe(true);
        } finally {
          vi.setSystemTime(realNow);
        }
      });

      it("frees the SEAT after staleness even though the id stays claimed", async () => {
        // Claim and chair are different things: one person going quiet must
        // not hold a chair for the room's whole life.
        for (let i = 0; i < ROOM_CAPACITY; i++) {
          await store().announce({
            roomId: room.id,
            peerId: `s${i}`,
            username: `S${i}`,
          });
        }
        const realNow = Date.now();
        vi.setSystemTime(realNow + PEER_TIMEOUT_MS + 5_000);
        try {
          const newcomer = await store().announce({
            roomId: room.id,
            peerId: "fresh",
            username: "Fresh",
          });
          expect(newcomer?.joined).toBe(true);
        } finally {
          vi.setSystemTime(realNow);
        }
      });

      it("releases the claim when the peer leaves deliberately", async () => {
        await store().announce(
          { roomId: room.id, peerId: "gone", username: "Gone" },
          { callerVerified: false, peerTokenValid: true }
        );
        await store().removePeer(room.id, "gone");
        // A fresh visitor may now take that id â€” it was given up, not lost.
        const reuse = await store().announce(
          { roomId: room.id, peerId: "gone", username: "New" },
          { callerVerified: false, peerTokenValid: false }
        );
        expect(reuse?.refused).toBeUndefined();
        expect(reuse?.joined).toBe(true);
      });
    });

    describe("capacity", () => {
      it("seats exactly ROOM_CAPACITY and refuses the next", async () => {
        for (let i = 0; i < ROOM_CAPACITY; i++) {
          const res = await store().announce({
            roomId: room.id,
            peerId: `p${i}`,
            username: `U${i}`,
          });
          expect(res?.joined).toBe(true);
        }
        const overflow = await store().announce({
          roomId: room.id,
          peerId: "late",
          username: "Late",
        });
        expect(overflow?.joined).toBe(false);
        expect(overflow?.peers.map((p) => p.peerId)).not.toContain("late");
        expect((await store().getRoom(room.id))?.peerCount).toBe(ROOM_CAPACITY);
      });

      it("never displaces a seated member", async () => {
        for (let i = 0; i < ROOM_CAPACITY; i++) {
          await store().announce({
            roomId: room.id,
            peerId: `p${i}`,
            username: `U${i}`,
          });
        }
        const beat = await store().announce({
          roomId: room.id,
          peerId: "p0",
          username: "U0",
        });
        expect(beat?.joined).toBe(true);
        expect(beat?.peers).toHaveLength(ROOM_CAPACITY);
      });
    });

    describe("discovery", () => {
      it("lists a public room only while someone is in it", async () => {
        const pub = (await store().createRoom(META({ visibility: "public" })))!;
        await store().announce({ roomId: pub.id, peerId: "a", username: "A" });
        expect(
          (await store().listActiveRooms()).find((r) => r.id === pub.id)
        ).toBeDefined();
        await store().removePeer(pub.id, "a");
        expect(
          (await store().listActiveRooms()).find((r) => r.id === pub.id)
        ).toBeUndefined();
      });

      it("never lists a private room", async () => {
        await store().announce({ roomId: room.id, peerId: "a", username: "A" });
        expect(
          (await store().listActiveRooms()).find((r) => r.id === room.id)
        ).toBeUndefined();
        expect((await store().getRoom(room.id))?.peerCount).toBe(1);
      });

      it("flags Deep Focus when any peer is in it", async () => {
        await store().announce({ roomId: room.id, peerId: "a", username: "A" });
        expect((await store().getRoom(room.id))?.deep).toBe(false);
        await store().announce({
          roomId: room.id,
          peerId: "b",
          username: "B",
          status: { deep: true },
        });
        expect((await store().getRoom(room.id))?.deep).toBe(true);
      });

      it("counts active peers across rooms, private included", async () => {
        const before = await store().countActivePeers();
        const pub = (await store().createRoom(META({ visibility: "public" })))!;
        await store().announce({ roomId: pub.id, peerId: "x", username: "X" });
        await store().announce({ roomId: room.id, peerId: "y", username: "Y" });
        expect((await store().countActivePeers()) - before).toBe(2);
      });

      it("getFeed agrees with its two halves", async () => {
        const pub = (await store().createRoom(META({ visibility: "public" })))!;
        await store().announce({ roomId: pub.id, peerId: "a", username: "A" });
        const feed = await store().getFeed();
        expect(feed.rooms.find((r) => r.id === pub.id)).toBeDefined();
        expect(feed.activeUsers).toBeGreaterThan(0);
      });

      it("returns null for a room that never existed", async () => {
        expect(await store().getRoom(nextId())).toBeNull();
      });
    });

    describe("removePeer", () => {
      it("is idempotent and harmless on unknown ids", async () => {
        await store().removePeer(room.id, "never-there");
        await store().removePeer(nextId(), "nobody");
        expect((await store().getRoom(room.id))?.peerCount).toBe(0);
      });

      it("drops the peer from the roster", async () => {
        await store().announce({ roomId: room.id, peerId: "a", username: "A" });
        await store().announce({ roomId: room.id, peerId: "b", username: "B" });
        await store().removePeer(room.id, "a");
        const peers = await store().listPeers(room.id);
        expect(peers.map((p) => p.peerId)).toEqual(["b"]);
      });
    });
  }
});
