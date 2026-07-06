import { Redis } from "@upstash/redis";
import { getRedisEnv } from "@/lib/env";
import type {
  AnnounceInput,
  Peer,
  RoomMeta,
  RoomPublic,
  StoreBackend,
} from "./types";
import {
  MAX_LIST_ROOMS,
  MAX_PEERS_PER_ROOM,
  MAX_ROOMS,
  PEER_TIMEOUT_MS,
  ROOM_TTL_SEC,
  sanitizeDuration,
  sanitizeName,
  sanitizePeerId,
  sanitizeRoomId,
  sanitizeStartedAt,
  sanitizeStatus,
  sanitizeSubject,
  sanitizeUsername,
} from "./sanitize";

// Redis schema (prefix wlis:):
//   wlis:room:{id}        -> hash { name, subject, durationSec, startedAt } (TTL)
//   wlis:room:{id}:peers  -> sorted set  peerId -> lastSeen (ms)            (TTL)
//   wlis:room:{id}:names  -> hash peerId -> JSON { username, joinedAt, status } (TTL)
//   wlis:rooms            -> sorted set  roomId -> startedAt    (discovery index)
const P = "wlis:";
const metaKey = (id: string) => `${P}room:${id}`;
const peersKey = (id: string) => `${P}room:${id}:peers`;
const namesKey = (id: string) => `${P}room:${id}:names`;
const INDEX = `${P}rooms`;

let client: Redis | null = null;
function redis(): Redis {
  if (!client) {
    const env = getRedisEnv();
    if (!env) throw new Error("Redis backend selected but no credentials set");
    client = new Redis({ url: env.url, token: env.token });
  }
  return client;
}

type RawMeta = {
  name?: unknown;
  subject?: unknown;
  durationSec?: unknown;
  startedAt?: unknown;
};

type PeerEntry = {
  username: string;
  joinedAt: number;
  status: { muted: boolean; away: boolean; deep: boolean; tint: string };
};

function parseMeta(id: string, raw: RawMeta | null, now: number): RoomMeta | null {
  if (!raw || raw.name === undefined || raw.name === null) return null;
  const durationSec = sanitizeDuration(Number(raw.durationSec));
  const startedAt = Number(raw.startedAt);
  return {
    id,
    name: String(raw.name),
    subject: raw.subject != null ? String(raw.subject) : "",
    durationSec,
    startedAt: Number.isFinite(startedAt) ? startedAt : now,
  };
}

// Tolerates both the JSON entries written now and the plain-string usernames
// written by the previous schema version.
function parsePeerEntry(raw: unknown, fallbackJoinedAt: number): PeerEntry {
  const def = {
    username: "Anon",
    joinedAt: fallbackJoinedAt,
    status: { muted: false, away: false, deep: false, tint: "" },
  };
  if (raw == null) return def;
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return {
      username: o.username != null ? String(o.username) : "Anon",
      joinedAt: Number.isFinite(Number(o.joinedAt))
        ? Number(o.joinedAt)
        : fallbackJoinedAt,
      status: sanitizeStatus(o.status),
    };
  }
  const s = String(raw);
  if (s.startsWith("{")) {
    try {
      return parsePeerEntry(JSON.parse(s), fallbackJoinedAt);
    } catch {
      return def;
    }
  }
  return { ...def, username: s || "Anon" };
}

// Drop stale peers from the sorted set + names hash, then return the live ones.
async function readPeers(id: string, now: number): Promise<Peer[]> {
  const r = redis();
  const raw = await r.zrange<(string | number)[]>(peersKey(id), 0, -1, {
    withScores: true,
  });

  const live: { peerId: string; lastSeen: number }[] = [];
  const stale: string[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const peerId = String(raw[i]);
    const lastSeen = Number(raw[i + 1]);
    if (now - lastSeen > PEER_TIMEOUT_MS) stale.push(peerId);
    else live.push({ peerId, lastSeen });
  }

  if (stale.length) {
    await r.zrem(peersKey(id), ...stale);
    await r.hdel(namesKey(id), ...stale);
  }
  if (live.length === 0) return [];

  const names = (await r.hgetall<Record<string, unknown>>(namesKey(id))) ?? {};
  return live.map((p) => {
    const entry = parsePeerEntry(names[p.peerId], p.lastSeen);
    return {
      peerId: p.peerId,
      username: entry.username,
      lastSeen: p.lastSeen,
      joinedAt: entry.joinedAt,
      status: entry.status,
    };
  });
}

function anyDeep(peers: Peer[]): boolean {
  return peers.some((p) => p.status.deep);
}

function publicView(meta: RoomMeta, peers: Peer[]): RoomPublic {
  return {
    ...meta,
    peerCount: peers.length,
    deep: anyDeep(peers),
    peerNames: peers.slice(0, 4).map((p) => p.username),
  };
}

export const redisBackend: StoreBackend = {
  async getRoom(id) {
    const roomId = sanitizeRoomId(id);
    const now = Date.now();
    const meta = parseMeta(
      roomId,
      await redis().hgetall<RawMeta>(metaKey(roomId)),
      now
    );
    if (!meta) return null;
    const peers = await readPeers(roomId, now);
    return publicView(meta, peers);
  },

  async listActiveRooms() {
    const r = redis();
    const now = Date.now();
    const ids = await r.zrange<string[]>(INDEX, 0, MAX_LIST_ROOMS - 1, {
      rev: true,
    });
    const out: RoomPublic[] = [];
    for (const id of ids) {
      const meta = parseMeta(id, await r.hgetall<RawMeta>(metaKey(id)), now);
      if (!meta) {
        // Metadata expired (TTL) — prune the dangling index entry.
        await r.zrem(INDEX, id);
        continue;
      }
      const peers = await readPeers(id, now);
      if (peers.length > 0) {
        out.push(publicView(meta, peers));
      }
    }
    return out;
  },

  async announce(input: AnnounceInput) {
    const r = redis();
    const now = Date.now();
    const roomId = sanitizeRoomId(input.roomId);

    let meta = parseMeta(roomId, await r.hgetall<RawMeta>(metaKey(roomId)), now);
    if (!meta) {
      const durationSec = sanitizeDuration(input.durationSec);
      const startedAt = sanitizeStartedAt(input.startedAt, durationSec, now);
      const name = sanitizeName(input.name);
      const subject = sanitizeSubject(input.subject);
      meta = { id: roomId, name, subject, durationSec, startedAt };
      await r.hset(metaKey(roomId), { name, subject, durationSec, startedAt });
      const roomCount = await r.zcard(INDEX);
      if (roomCount < MAX_ROOMS) {
        await r.zadd(INDEX, { score: startedAt, member: roomId });
      }
    }

    const peerId = sanitizePeerId(input.peerId);
    const existingRaw = await r.hget(namesKey(roomId), peerId);
    const alreadyMember = existingRaw !== null;
    const peerCount = await r.zcard(peersKey(roomId));
    // Soft per-room cap: silently skip a brand-new peer once full.
    if (alreadyMember || peerCount < MAX_PEERS_PER_ROOM) {
      const prev = parsePeerEntry(existingRaw, now);
      const entry: PeerEntry = {
        username: sanitizeUsername(input.username),
        joinedAt: alreadyMember ? prev.joinedAt : now,
        status: sanitizeStatus(input.status),
      };
      await r.zadd(peersKey(roomId), { score: now, member: peerId });
      await r.hset(namesKey(roomId), { [peerId]: JSON.stringify(entry) });
    }

    // Refresh TTLs so an active room lives on and an abandoned one expires.
    await r.expire(metaKey(roomId), ROOM_TTL_SEC);
    await r.expire(peersKey(roomId), ROOM_TTL_SEC);
    await r.expire(namesKey(roomId), ROOM_TTL_SEC);

    const peers = await readPeers(roomId, now);
    return { peers, room: meta };
  },

  async removePeer(roomId, peerId) {
    const r = redis();
    const id = sanitizeRoomId(roomId);
    const pid = sanitizePeerId(peerId);
    await r.zrem(peersKey(id), pid);
    await r.hdel(namesKey(id), pid);
    // Room metadata is left in place; its TTL expires it once truly abandoned.
  },

  async listPeers(roomId) {
    return readPeers(sanitizeRoomId(roomId), Date.now());
  },
};

// Best-effort fixed-window rate limit per IP for mutating routes. Deliberately
// generous so it only catches floods, not legit users behind a shared NAT.
export async function redisAllow(
  ip: string,
  limit = 240,
  windowSec = 60
): Promise<boolean> {
  const r = redis();
  const k = `${P}rl:${ip}`;
  const n = await r.incr(k);
  if (n === 1) await r.expire(k, windowSec);
  return n <= limit;
}
