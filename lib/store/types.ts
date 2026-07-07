// Per-peer live status, broadcast with each heartbeat.
export type PeerStatus = {
  muted: boolean;
  away: boolean;
  deep: boolean; // Deep Focus engaged
  tint: string; // chosen avatar tint key ("" = automatic)
};

export type Peer = {
  peerId: string;
  username: string;
  lastSeen: number;
  joinedAt: number; // first announce in this room (per-person focus time)
  status: PeerStatus;
};

export type RoomMeta = {
  id: string;
  name: string;
  subject: string;
  durationSec: number;
  startedAt: number;
  visibility: "public" | "private"; // private = joinable by code only, never listed
};

export type RoomPublic = RoomMeta & {
  peerCount: number;
  deep: boolean; // any participant currently in Deep Focus
  peerNames: string[]; // up to 4, for the stacked avatars on the home list
};

export type AnnounceInput = {
  roomId: string;
  peerId: string;
  username: string;
  name?: string;
  subject?: string;
  durationSec?: number;
  startedAt?: number;
  visibility?: string;
  status?: Partial<PeerStatus> & { tint?: string };
};

// Both the in-memory and Redis implementations satisfy this async contract, so
// the API routes are backend-agnostic.
export interface StoreBackend {
  getRoom(id: string): Promise<RoomPublic | null>;
  listActiveRooms(): Promise<RoomPublic[]>;
  countActivePeers(): Promise<number>; // across ALL rooms (visibility-blind)
  announce(input: AnnounceInput): Promise<{ peers: Peer[]; room: RoomMeta }>;
  removePeer(roomId: string, peerId: string): Promise<void>;
  listPeers(roomId: string): Promise<Peer[]>;
}
