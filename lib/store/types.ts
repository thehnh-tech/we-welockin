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
  institution: string; // university display name ("" = none) — public rooms only
};

export type RoomPublic = RoomMeta & {
  peerCount: number;
  deep: boolean; // any participant currently in Deep Focus
  peerNames: string[]; // up to 4, for the stacked avatars on the feed cards
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
  // Server-side only: filled from the verified-university cookie by the API
  // route, never from the request body.
  institution?: string;
  status?: Partial<PeerStatus> & { tint?: string };
};

// Both the in-memory and Redis implementations satisfy this async contract, so
// the API routes are backend-agnostic.
export interface StoreBackend {
  getRoom(id: string): Promise<RoomPublic | null>;
  listActiveRooms(): Promise<RoomPublic[]>;
  countActivePeers(): Promise<number>; // across ALL rooms (visibility-blind)
  // Pre-create a room with no peers (the public-room flow: POST /api/rooms
  // writes the meta before the creator's first announce). Returns the meta as
  // actually STORED (sanitized/clamped) so the caller never echoes back values
  // that differ from what everyone else will read, or null when the id is
  // already taken so the caller can regenerate.
  createRoom(meta: RoomMeta): Promise<RoomMeta | null>;
  announce(input: AnnounceInput): Promise<{ peers: Peer[]; room: RoomMeta }>;
  removePeer(roomId: string, peerId: string): Promise<void>;
  listPeers(roomId: string): Promise<Peer[]>;
}
