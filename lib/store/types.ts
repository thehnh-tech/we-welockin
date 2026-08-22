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
  capacity: number; // seats in the room; peerCount === capacity means full
  deep: boolean; // any participant currently in Deep Focus
  peerNames: string[]; // up to 4, for the stacked avatars on the feed cards
};

// Announcing is PRESENCE ONLY. A room's identity — name, timer, visibility,
// institution — is fixed when it is created and is never carried on a
// heartbeat, so there is nothing here for a client to lie about.
export type AnnounceInput = {
  roomId: string;
  peerId: string;
  username: string;
  status?: Partial<PeerStatus> & { tint?: string };
};

// Server-derived facts about the caller, kept OUT of AnnounceInput on
// purpose: the input's invariant is "nothing a client could lie about", and
// these two are computed by the route itself — from the verified-university
// cookie and from the peer-token HMAC — never from the request body.
export type AnnounceGuard = {
  callerVerified: boolean;
  peerTokenValid: boolean;
};

// Both the in-memory and Redis implementations satisfy this async contract, so
// the API routes are backend-agnostic.
// What the home page polls: the public feed plus the global active count
// (raw, without the marketing floor — the route adds that).
export type FeedSnapshot = {
  activeUsers: number;
  rooms: RoomPublic[];
};

export interface StoreBackend {
  getRoom(id: string): Promise<RoomPublic | null>;
  listActiveRooms(): Promise<RoomPublic[]>;
  countActivePeers(): Promise<number>; // across ALL rooms (visibility-blind)
  // Both feed halves in one call, because every home-page visitor polls this
  // every few seconds: a backend may serve it from a short-lived shared
  // snapshot. The freshness contract is "a few seconds", never
  // read-your-writes — the UI already tolerates that (a full room answers
  // 409 on join, whatever the card said).
  getFeed(): Promise<FeedSnapshot>;
  // Pre-create a room with no peers (the public-room flow: POST /api/rooms
  // writes the meta before the creator's first announce). Returns the meta as
  // actually STORED (sanitized/clamped) so the caller never echoes back values
  // that differ from what everyone else will read, or null when the id is
  // already taken so the caller can regenerate.
  createRoom(meta: RoomMeta): Promise<RoomMeta | null>;
  // Presence heartbeat for an EXISTING room. Returns null when the room does
  // not exist (or has expired): rooms are born only through createRoom, so a
  // heartbeat can never conjure one at an id of the caller's choosing, and a
  // dead room's link stays dead instead of quietly reopening as someone
  // else's room.
  //
  // `joined` is false when the room was already full and this peer is NOT a
  // member — the caller turns that into a visible "room is full" answer
  // instead of letting someone sit in a room nobody can see them in.
  //
  // `refused` rejections (only produced when a guard is passed) come back
  // WITHOUT the store being touched — a refused caller must not refresh any
  // TTL or hold the room alive:
  //   "verification" — the stored room is public and the caller unverified;
  //   "taken"        — the peer id already has an entry and the caller could
  //                    not prove it is theirs (closes the roster-read →
  //                    seat-write TOCTOU the route-level check had).
  announce(
    input: AnnounceInput,
    guard?: AnnounceGuard
  ): Promise<{
    peers: Peer[];
    room: RoomMeta;
    joined: boolean;
    refused?: "verification" | "taken";
  } | null>;
  removePeer(roomId: string, peerId: string): Promise<void>;
  listPeers(roomId: string): Promise<Peer[]>;
}
