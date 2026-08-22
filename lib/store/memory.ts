import type {
  AnnounceInput,
  Peer,
  RoomMeta,
  RoomPublic,
  StoreBackend,
} from "./types";
import {
  MAX_ROOMS,
  ROOM_CAPACITY,
  PEER_TIMEOUT_MS,
  ROOM_GRACE_MS,
  sanitizeDuration,
  sanitizeInstitution,
  sanitizeName,
  sanitizePeerId,
  sanitizeRoomId,
  sanitizeStartedAt,
  sanitizeStatus,
  sanitizeSubject,
  sanitizeUsername,
  sanitizeVisibility,
} from "./sanitize";

type MemRoom = RoomMeta & {
  peers: Map<string, Peer>;
  emptySince: number | null;
};

// Process-local store. On Vercel each serverless instance has its own copy, so
// this backend is only correct for local dev / a single long-lived instance.
// Configure Upstash/KV for production (see lib/store/redis.ts).
const g = globalThis as unknown as {
  __wlisStore?: { rooms: Map<string, MemRoom> };
};
if (!g.__wlisStore) g.__wlisStore = { rooms: new Map() };
const store = g.__wlisStore;

function cleanupRoom(room: MemRoom | undefined, now: number): void {
  if (!room) return;
  for (const [peerId, peer] of room.peers) {
    if (now - peer.lastSeen > PEER_TIMEOUT_MS) room.peers.delete(peerId);
  }
  if (room.peers.size === 0) {
    if (room.emptySince === null) room.emptySince = now;
  } else {
    room.emptySince = null;
  }
}

function cleanupAll(now: number): void {
  for (const [id, room] of store.rooms) {
    cleanupRoom(room, now);
    // Keep an empty room for a grace window so a returning creator does not lose
    // its metadata (timer/name) during a brief presence gap.
    if (
      room.peers.size === 0 &&
      room.emptySince !== null &&
      now - room.emptySince > ROOM_GRACE_MS
    ) {
      store.rooms.delete(id);
    }
  }
}

function anyDeep(room: MemRoom): boolean {
  for (const p of room.peers.values()) {
    if (p.status.deep) return true;
  }
  return false;
}

function toPublic(room: MemRoom): RoomPublic {
  return {
    id: room.id,
    name: room.name,
    subject: room.subject,
    durationSec: room.durationSec,
    startedAt: room.startedAt,
    visibility: room.visibility,
    institution: room.institution,
    peerCount: room.peers.size,
    capacity: ROOM_CAPACITY,
    deep: anyDeep(room),
    peerNames: Array.from(room.peers.values(), (p) => p.username).slice(0, 4),
  };
}

function toMeta(room: MemRoom): RoomMeta {
  return {
    id: room.id,
    name: room.name,
    subject: room.subject,
    durationSec: room.durationSec,
    startedAt: room.startedAt,
    visibility: room.visibility,
    institution: room.institution,
  };
}

export const memoryBackend: StoreBackend = {
  async getRoom(id) {
    const now = Date.now();
    const room = store.rooms.get(sanitizeRoomId(id));
    cleanupRoom(room, now);
    return room ? toPublic(room) : null;
  },

  async listActiveRooms() {
    const now = Date.now();
    cleanupAll(now);
    // Private rooms never show up in discovery — code/link only.
    return Array.from(store.rooms.values())
      .filter((r) => r.peers.size > 0 && r.visibility === "public")
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(toPublic);
  },

  async countActivePeers() {
    const now = Date.now();
    cleanupAll(now);
    let total = 0;
    for (const room of store.rooms.values()) total += room.peers.size;
    return total;
  },

  // No snapshot needed in-process: both halves are cheap map walks.
  async getFeed() {
    return {
      activeUsers: await memoryBackend.countActivePeers(),
      rooms: await memoryBackend.listActiveRooms(),
    };
  },

  async createRoom(meta) {
    const now = Date.now();
    if (store.rooms.size >= MAX_ROOMS) cleanupAll(now);
    const id = sanitizeRoomId(meta.id);
    if (store.rooms.has(id)) return null;
    const durationSec = sanitizeDuration(meta.durationSec);
    const room: MemRoom = {
      id,
      name: sanitizeName(meta.name),
      subject: sanitizeSubject(meta.subject),
      durationSec,
      startedAt: sanitizeStartedAt(meta.startedAt, durationSec, now),
      visibility: sanitizeVisibility(meta.visibility),
      institution: sanitizeInstitution(meta.institution),
      peers: new Map(),
      // Empty until the creator's first announce — the grace window keeps it
      // alive meanwhile.
      emptySince: now,
    };
    store.rooms.set(id, room);
    return toMeta(room);
  },

  async announce(input: AnnounceInput) {
    const now = Date.now();
    const roomId = sanitizeRoomId(input.roomId);
    const room = store.rooms.get(roomId);
    if (!room) return null; // rooms are born only in createRoom

    const peerId = sanitizePeerId(input.peerId);
    cleanupRoom(room, now);
    // Members always get back in (a heartbeat must never be evicted by the
    // cap); a newcomer only when there is a free seat.
    const existing = room.peers.get(peerId);
    const joined = !!existing || room.peers.size < ROOM_CAPACITY;
    if (joined) {
      room.peers.set(peerId, {
        peerId,
        username: sanitizeUsername(input.username),
        lastSeen: now,
        joinedAt: existing?.joinedAt ?? now,
        status: sanitizeStatus(input.status),
      });
      room.emptySince = null;
    }

    return {
      peers: Array.from(room.peers.values()),
      room: toMeta(room),
      joined,
    };
  },

  async removePeer(roomId, peerId) {
    const room = store.rooms.get(sanitizeRoomId(roomId));
    if (!room) return;
    room.peers.delete(sanitizePeerId(peerId));
    // Do not delete the room here — keep metadata for the grace window
    // (cleanupAll drops it once it has stayed empty past ROOM_GRACE_MS).
    if (room.peers.size === 0 && room.emptySince === null) {
      room.emptySince = Date.now();
    }
  },

  async listPeers(roomId) {
    const now = Date.now();
    const room = store.rooms.get(sanitizeRoomId(roomId));
    if (!room) return [];
    cleanupRoom(room, now);
    return Array.from(room.peers.values());
  },
};
