export type Peer = {
  peerId: string;
  username: string;
  lastSeen: number;
};

export type RoomMeta = {
  id: string;
  name: string;
  durationSec: number;
  startedAt: number;
};

export type RoomPublic = RoomMeta & { peerCount: number };

export type AnnounceInput = {
  roomId: string;
  peerId: string;
  username: string;
  name?: string;
  durationSec?: number;
  startedAt?: number;
};

// Both the in-memory and Redis implementations satisfy this async contract, so
// the API routes are backend-agnostic.
export interface StoreBackend {
  getRoom(id: string): Promise<RoomPublic | null>;
  listActiveRooms(): Promise<RoomPublic[]>;
  announce(input: AnnounceInput): Promise<{ peers: Peer[]; room: RoomMeta }>;
  removePeer(roomId: string, peerId: string): Promise<void>;
  listPeers(roomId: string): Promise<Peer[]>;
}
