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

// Best-effort per-IP rate limit for mutating routes. No-op on the in-memory
// backend (single-instance dev), and an outage must never take the app down.
export async function allowMutation(ip: string): Promise<boolean> {
  if (isRedisConfigured()) {
    try {
      return await redisAllow(ip);
    } catch {
      return true;
    }
  }
  if (isMongoConfigured()) {
    return allowVerify(`rl:${ip}`, 240, 60); // fail-open inside
  }
  return true;
}
