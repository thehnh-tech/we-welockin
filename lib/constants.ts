// Client-side timing, centralized so the presence/heartbeat cadence is in one
// place. The cross-domain invariant with the server is:
//
//   PEER_DROP_MS  >  PEER_TIMEOUT_MS (lib/store/sanitize.ts, 30s)  >  HEARTBEAT_MS
//
// i.e. we keep a peer locally longer than the server keeps it, and we heartbeat
// well within the server timeout.

export const HEARTBEAT_MS = 4_000; // announce/heartbeat interval (also the peer poll)
export const PEER_DROP_MS = 60_000; // drop a call only after this much silence
export const STALL_HINT_MS = 15_000; // delay before the "needs TURN" hint
export const ROOMS_POLL_MS = 4_000; // home page rooms-list refresh
