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
  peers: Map<string, Peer>;
};

const PEER_TIMEOUT_MS = 30_000;

type Store = { rooms: Map<string, Room> };

const g = globalThis as unknown as { __studyStore?: Store };
if (!g.__studyStore) {
  g.__studyStore = { rooms: new Map() };
}
const store = g.__studyStore;

export function getRoom(id: string): Room | undefined {
  cleanupRoom(store.rooms.get(id));
  return store.rooms.get(id);
}

export function listActiveRooms(): Room[] {
  cleanupAll();
  return Array.from(store.rooms.values()).sort(
    (a, b) => b.startedAt - a.startedAt
  );
}

export function announce(input: {
  roomId: string;
  peerId: string;
  username: string;
  name?: string;
  durationSec?: number;
  startedAt?: number;
}): { peers: Peer[]; room: Room } {
  let room = store.rooms.get(input.roomId);
  if (!room) {
    room = {
      id: input.roomId,
      name: (input.name ?? "").slice(0, 60) || "Study session",
      durationSec: Math.max(
        60,
        Math.min(8 * 3600, Math.floor(input.durationSec ?? 1500))
      ),
      startedAt: Math.floor(input.startedAt ?? Date.now()),
      peers: new Map(),
    };
    store.rooms.set(input.roomId, room);
  }
  room.peers.set(input.peerId, {
    peerId: input.peerId,
    username: input.username.slice(0, 30) || "Anon",
    lastSeen: Date.now(),
  });
  cleanupRoom(room);
  return { peers: Array.from(room.peers.values()), room };
}

export function removePeer(roomId: string, peerId: string): void {
  const room = store.rooms.get(roomId);
  if (!room) return;
  room.peers.delete(peerId);
  if (room.peers.size === 0) {
    store.rooms.delete(roomId);
  }
}

export function listPeers(roomId: string): Peer[] {
  const room = store.rooms.get(roomId);
  if (!room) return [];
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
    if (room.peers.size === 0) {
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
