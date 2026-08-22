import { isRedisConfigured } from "@/lib/env";
import { isMongoConfigured } from "@/lib/db/mongo";
import { allowVerify } from "@/lib/verify/store";
import { memoryBackend } from "./memory";
import { mongoBackend } from "./mongo";
import { redisAllowMulti, redisBackend } from "./redis";
import type {
  AnnounceGuard,
  AnnounceInput,
  RoomMeta,
  StoreBackend,
} from "./types";

export type { Peer, RoomMeta, RoomPublic, AnnounceInput } from "./types";

// Pick the backend once at module load. Preference order:
//   1. Upstash Redis  — purpose-built for this ephemeral presence workload
//   2. MongoDB        — shared across instances too (TTL-swept collections)
//   3. In-memory      — local dev / single long-lived instance only
const backend: StoreBackend = isRedisConfigured()
  ? redisBackend
  : isMongoConfigured()
    ? mongoBackend
    : memoryBackend;

export function activeBackendName(): "redis" | "mongo" | "memory" {
  return backend === redisBackend
    ? "redis"
    : backend === mongoBackend
      ? "mongo"
      : "memory";
}

// The memory fallback is per-instance: on a serverless deployment two people
// in the same room can land on different instances and never see each other,
// and the rate limiter fragments the same way. That failure mode is invisible
// in a solo test — everything works on one instance — so a silent fallback
// ships green and breaks on launch night. No throw (it would break builds
// that inject env at runtime), but it should be impossible to miss in logs,
// and GET /api/health reports it.
if (process.env.VERCEL && backend === memoryBackend) {
  console.error(
    "[store] NO SHARED STORE CONFIGURED on a serverless deployment: presence " +
      "is per-instance and users will not reliably see each other. Set " +
      "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or MONGODB_URI)."
  );
}

export const getRoom = (id: string) => backend.getRoom(id);
export const listActiveRooms = () => backend.listActiveRooms();
export const countActivePeers = () => backend.countActivePeers();
export const getFeed = () => backend.getFeed();
export const createRoom = (meta: RoomMeta) => backend.createRoom(meta);
export const announce = (input: AnnounceInput, guard?: AnnounceGuard) =>
  backend.announce(input, guard);
export const removePeer = (roomId: string, peerId: string) =>
  backend.removePeer(roomId, peerId);
export const listPeers = (roomId: string) => backend.listPeers(roomId);

// Per-IP rate limits. Both paths need one: a room code is the only credential
// a private room has, so an unmetered read endpoint is an offline-speed
// guessing oracle against it. The in-memory limiter is used when no shared
// store is configured — weaker across instances than a shared counter, but far
// better than the previous unconditional `true`.
type LimitWindow = { key: string; limit: number; windowSec: number };

async function allowMulti(entries: LimitWindow[]): Promise<boolean> {
  if (isRedisConfigured()) {
    try {
      return await redisAllowMulti(entries);
    } catch (err) {
      // Never let a limiter outage take down the app — but never silently
      // either: a broken limiter under load is exactly when it matters.
      console.error("[store] rate limiter unavailable, failing open:", err);
      return true;
    }
  }
  const results = await Promise.all(
    entries.map((e) => allowVerify(`rl:${e.key}`, e.limit, e.windowSec))
  ); // fail-open inside
  return results.every(Boolean);
}

function allow(key: string, limit: number, windowSec: number) {
  return allowMulti([{ key, limit, windowSec }]);
}

// Budgets are set against the worst legitimate case, which is a university
// NAT: hundreds of students can share one address, and each peer heartbeats
// every 4s (15 writes/min). Too tight and a whole campus locks itself out —
// so these are generous, and lean on the code's 887M-wide id space to make
// guessing impractical rather than on a small per-minute number.

// Writes: creating rooms, first joins, leaving. ~40 concurrent peers per
// shared address at the old 4s cadence — and since seated members heartbeat
// on their own per-seat budget (below), this window now only carries the
// bursts: arrivals, departures, room creation.
export function allowMutation(ip: string): Promise<boolean> {
  return allow(`mut:${ip}`, 600, 60);
}

// Heartbeats of a seated member, authenticated by their peer token (HMAC,
// verified without a store round-trip). Per-seat budget instead of the shared
// per-IP one, so a whole campus can sit behind one NAT without the beats
// starving each other: 30/min leaves ~5x headroom over the 10s cadence plus
// status-change announces. The wide per-address ceiling rides along because
// peer tokens never expire — someone recycling peerIds in their own room
// could otherwise mint themselves an unbounded stack of budgets.
export function allowHeartbeat(
  ip: string,
  roomId: string,
  peerId: string
): Promise<boolean> {
  return allowMulti([
    { key: `hb:${roomId}:${peerId}`, limit: 30, windowSec: 60 },
    { key: `flood:${ip}`, limit: 3000, windowSec: 60 },
  ]);
}

// Reads: room lookup and roster — one or two per person per session, so this
// is orders of magnitude above real use. It exists to bound id-space walking:
// at this rate, stumbling onto any live room takes weeks of sustained,
// conspicuous traffic.
export function allowRead(ip: string): Promise<boolean> {
  return allow(`read:${ip}`, 300, 60);
}

// The public feed. A CDN normally serves this, but its cache key includes the
// query string, so a caller who varies it reaches the origin every time and
// pays for a full feed computation. Sized for a campus polling every few
// seconds, which is roughly 20/min per person.
export function allowFeed(ip: string): Promise<boolean> {
  return allow(`feed:${ip}`, 1200, 60);
}

// Taking a NEW seat (as opposed to heartbeating one you hold). A public
// room's seats are its scarcest resource — six per room — so one caller must
// not be able to sit in every room on the feed at once.
//
// The account is the real control here, and it only exists for a verified
// caller: pass null for everyone else rather than falling back to the IP.
// That fallback turned the per-account window into a SECOND, tighter per-IP
// window, and since a private room needs no verification it applied to
// essentially everyone — 20 joins per 10 minutes for an entire building.
// Measured on a campus NAT: 67% of heartbeats refused, students locked out
// of rooms they were already sitting in.
//
// The per-address window is therefore sized for the worst legitimate case, a
// university NAT: 300 per 10 minutes is 30 a minute for a whole campus,
// generous for humans while still bounding a script — which also pays
// allowMutation (600/min) and cannot exceed room capacity anyway. Refused
// attempts count too (the counter increments before the verdict), so a
// student hammering a full room spends budget; at this size that costs
// precision, not access.
export function allowJoin(
  ip: string,
  identity: string | null
): Promise<boolean> {
  const windows: LimitWindow[] = [
    { key: `join:ip:${ip}`, limit: 300, windowSec: 600 },
  ];
  if (identity) {
    windows.push({ key: `join:id:${identity}`, limit: 20, windowSec: 600 });
  }
  return allowMulti(windows);
}
