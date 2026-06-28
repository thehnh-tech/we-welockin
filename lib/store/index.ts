import { isRedisConfigured } from "@/lib/env";
import { memoryBackend } from "./memory";
import { redisAllow, redisBackend } from "./redis";
import type { AnnounceInput, StoreBackend } from "./types";

export type { Peer, RoomMeta, RoomPublic, AnnounceInput } from "./types";

// Pick the backend once at module load. Redis when credentials are present
// (production / multi-instance), otherwise the process-local in-memory store.
const backend: StoreBackend = isRedisConfigured() ? redisBackend : memoryBackend;

export const getRoom = (id: string) => backend.getRoom(id);
export const listActiveRooms = () => backend.listActiveRooms();
export const announce = (input: AnnounceInput) => backend.announce(input);
export const removePeer = (roomId: string, peerId: string) =>
  backend.removePeer(roomId, peerId);
export const listPeers = (roomId: string) => backend.listPeers(roomId);

// No-op without Redis (the in-memory fallback is single-instance anyway).
export async function allowMutation(ip: string): Promise<boolean> {
  if (!isRedisConfigured()) return true;
  try {
    return await redisAllow(ip);
  } catch {
    return true; // never let a limiter outage take down the app
  }
}
