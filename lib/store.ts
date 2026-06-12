export type Peer = {
  peerId: string;
  username: string;
  lastSeen: number;
};

export type Room = {
  id: string;
  name: string;
  durationSec: number;
  startedAt: number;
  createdAt: number;
  peers: Map<string, Peer>;
};

const PEER_TIMEOUT_MS = 15_000;
const ROOM_IDLE_TIMEOUT_MS = 60_000;

type Store = {
  rooms: Map<string, Room>;
};

const g = globalThis as unknown as { __studyStore?: Store };
if (!g.__studyStore) {
  g.__studyStore = { rooms: new Map() };
}
const store = g.__studyStore;

function shortId(len = 6): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

export function createRoom(input: { name: string; durationSec: number }): Room {
  const now = Date.now();
  let id = shortId();
  while (store.rooms.has(id)) id = shortId();
  const room: Room = {
    id,
    name: input.name.trim().slice(0, 60) || "Study session",
    durationSec: Math.max(60, Math.min(8 * 3600, Math.floor(input.durationSec))),
    startedAt: now,
    createdAt: now,
    peers: new Map(),
  };
  store.rooms.set(id, room);
  return room;
}

export function getRoom(id: string): Room | undefined {
  cleanupRoom(store.rooms.get(id));
  return store.rooms.get(id);
}

export function listActiveRooms(): Room[] {
  cleanupAll();
  return Array.from(store.rooms.values()).sort(
    (a, b) => b.createdAt - a.createdAt
  );
}

export function upsertPeer(
  roomId: string,
  peerId: string,
  username: string
): { ok: boolean; peers?: Peer[] } {
  const room = store.rooms.get(roomId);
  if (!room) return { ok: false };
  const now = Date.now();
  room.peers.set(peerId, {
    peerId,
    username: username.slice(0, 30) || "Anon",
    lastSeen: now,
  });
  cleanupRoom(room);
  return { ok: true, peers: Array.from(room.peers.values()) };
}

export function removePeer(roomId: string, peerId: string): void {
  const room = store.rooms.get(roomId);
  if (!room) return;
  room.peers.delete(peerId);
  if (room.peers.size === 0 && Date.now() - room.createdAt > ROOM_IDLE_TIMEOUT_MS) {
    store.rooms.delete(roomId);
  }
}

export function listPeers(roomId: string): Peer[] | undefined {
  const room = store.rooms.get(roomId);
  if (!room) return undefined;
  cleanupRoom(room);
  return Array.from(room.peers.values());
}

function cleanupRoom(room: Room | undefined) {
  if (!room) return;
  const now = Date.now();
  for (const [peerId, peer] of room.peers) {
    if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
      room.peers.delete(peerId);
    }
  }
}

function cleanupAll() {
  const now = Date.now();
  for (const [id, room] of store.rooms) {
    cleanupRoom(room);
    if (
      room.peers.size === 0 &&
      now - room.createdAt > ROOM_IDLE_TIMEOUT_MS
    ) {
      store.rooms.delete(id);
    }
  }
}

export function roomPublicView(room: Room) {
  return {
    id: room.id,
    name: room.name,
    durationSec: room.durationSec,
    startedAt: room.startedAt,
    peerCount: room.peers.size,
  };
}
