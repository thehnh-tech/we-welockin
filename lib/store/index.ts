import { isRedisConfigured } from "@/lib/env";
import { isMongoConfigured } from "@/lib/db/mongo";
import { allowVerify } from "@/lib/verify/store";
import { memoryBackend } from "./memory";
import { mongoBackend } from "./mongo";
import { redisAllow, redisBackend } from "./redis";
import type { AnnounceInput, RoomMeta, StoreBackend } from "./types";

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

export const getRoom = (id: string) => backend.getRoom(id);
export const listActiveRooms = () => backend.listActiveRooms();
export const countActivePeers = () => backend.countActivePeers();
export const createRoom = (meta: RoomMeta) => backend.createRoom(meta);
export const announce = (input: AnnounceInput) => backend.announce(input);
export const removePeer = (roomId: string, peerId: string) =>
  backend.removePeer(roomId, peerId);
export const listPeers = (roomId: string) => backend.listPeers(roomId);

// Per-IP rate limits. Both paths need one: a room code is the only credential
// a private room has, so an unmetered read endpoint is an offline-speed
// guessing oracle against it. The in-memory limiter is used when no shared
// store is configured — weaker across instances than a shared counter, but far
// better than the previous unconditional `true`.
async function allow(
  key: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  if (isRedisConfigured()) {
    try {
      return await redisAllow(key, limit, windowSec);
    } catch {
      return true; // never let a limiter outage take down the app
    }
  }
  return allowVerify(`rl:${key}`, limit, windowSec); // fail-open inside
}

// Budgets are set against the worst legitimate case, which is a university
// NAT: hundreds of students can share one address, and each peer heartbeats
// every 4s (15 writes/min). Too tight and a whole campus locks itself out —
// so these are generous, and lean on the code's 887M-wide id space to make
// guessing impractical rather than on a small per-minute number.

// Writes: creating rooms, announcing presence, leaving. ~40 concurrent peers
// per shared address.
export function allowMutation(ip: string): Promise<boolean> {
  return allow(`mut:${ip}`, 600, 60);
}

// Reads: room lookup and roster — one or two per person per session, so this
// is orders of magnitude above real use. It exists to bound id-space walking:
// at this rate, stumbling onto any live room takes weeks of sustained,
// conspicuous traffic.
export function allowRead(ip: string): Promise<boolean> {
  return allow(`read:${ip}`, 300, 60);
}
