// Client-side timing, centralized so the presence/heartbeat cadence is in one
// place. The cross-domain invariant with the server is:
//
//   PEER_DROP_MS  >  PEER_TIMEOUT_MS (lib/store/sanitize.ts, 30s)  >  HEARTBEAT_MS
//                                                and HEARTBEAT_BACKOFF_MAX_MS
//
// i.e. we keep a peer locally longer than the server keeps it, and we
// heartbeat — even at maximum backoff — well within the server timeout, so a
// throttled client never loses its seat just for backing off.

export const HEARTBEAT_MS = 10_000; // announce/heartbeat interval (also the peer poll)
// Right after joining, beat faster for a moment: the heartbeat doubles as the
// roster poll, and with "lower id initiates" a newcomer may otherwise stare at
// an empty room for a full interval waiting to be called.
export const JOIN_BURST_DELAYS_MS = [2_000, 5_000];
// After a 429, skip ahead by doubling the interval up to this cap — kept under
// PEER_TIMEOUT_MS (30s) so backing off never expires our own presence.
export const HEARTBEAT_BACKOFF_MAX_MS = 20_000;
export const ROOM_FULL_RETRY_MS = 60_000; // probe a full room for a freed seat
export const ANNOUNCE_TIMEOUT_MS = 8_000; // abort a hung announce fetch
export const PEER_DROP_MS = 60_000; // drop a call only after this much silence
export const STALL_HINT_MS = 25_000; // delay before the "needs TURN" hint (>2 beats)
export const ROOMS_POLL_MS = 4_000; // home page rooms-list refresh
// Per-sender video ceiling. A full room is 5 outgoing streams; uncapped VGA
// VP8 runs ~1-1.4 Mbps each, saturating a laptop uplink on campus Wi-Fi.
export const VIDEO_MAX_BITRATE = 350_000;
