import { Redis } from "@upstash/redis";
import { getRedisEnv } from "@/lib/env";
import type {
  AnnounceGuard,
  AnnounceInput,
  FeedSnapshot,
  Peer,
  RoomMeta,
  RoomPublic,
  StoreBackend,
} from "./types";
import {
  MAX_LIST_ROOMS,
  MAX_ROOMS,
  ROOM_CAPACITY,
  PEER_TIMEOUT_MS,
  ROOM_TTL_SEC,
  sanitizeDuration,
  sanitizeInstitution,
  sanitizeName,
  sanitizePeerId,
  sanitizeRoomId,
  sanitizeStartedAt,
  sanitizeStatus,
  sanitizeSubject,
  sanitizeUsername,
  sanitizeVisibility,
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
const FEED_KEY = `${P}feed`;

// Feed snapshot TTL: 2-4s, jittered per write so multi-region deployments do
// not expire (and rebuild) in lockstep.
const feedTtlSec = () => 2 + Math.floor(Math.random() * 3);

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
  visibility?: unknown;
  institution?: unknown;
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
    visibility: sanitizeVisibility(raw.visibility),
    institution: raw.institution != null ? String(raw.institution) : "",
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

// Split a WITHSCORES zrange result into live members and stale ones (no
// heartbeat within PEER_TIMEOUT_MS). Liveness always comes from the scores —
// never from zcard, which would count the stale.
function splitLive(raw: (string | number)[], now: number) {
  const live: { peerId: string; lastSeen: number }[] = [];
  const stale: string[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const peerId = String(raw[i]);
    const lastSeen = Number(raw[i + 1]);
    if (now - lastSeen > PEER_TIMEOUT_MS) stale.push(peerId);
    else live.push({ peerId, lastSeen });
  }
  return { live, stale };
}

function toPeers(
  live: { peerId: string; lastSeen: number }[],
  names: Record<string, unknown>
): Peer[] {
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

// Drop stale peers from the sorted set + names hash, then return the live ones.
async function readPeers(id: string, now: number): Promise<Peer[]> {
  const r = redis();
  const raw = await r.zrange<(string | number)[]>(peersKey(id), 0, -1, {
    withScores: true,
  });

  const { live, stale } = splitLive(raw, now);
  if (stale.length) {
    await r.zrem(peersKey(id), ...stale);
    await r.hdel(namesKey(id), ...stale);
  }
  if (live.length === 0) return [];

  const names = (await r.hgetall<Record<string, unknown>>(namesKey(id))) ?? {};
  return toPeers(live, names);
}

function anyDeep(peers: Peer[]): boolean {
  return peers.some((p) => p.status.deep);
}

// Always index the room, then trim the index to the MAX_ROOMS most recent.
// Skipping the insert at the cap instead would silently make a freshly created
// public room undiscoverable — created, joinable, but never on the feed.
// Trimming drops the OLDEST entries, whose metadata has usually expired anyway.
async function indexRoom(r: Redis, id: string, startedAt: number) {
  await r.zadd(INDEX, { score: startedAt, member: id });
  await r.zremrangebyrank(INDEX, 0, -(MAX_ROOMS + 1));
}

function publicView(meta: RoomMeta, peers: Peer[]): RoomPublic {
  return {
    ...meta,
    peerCount: peers.length,
    capacity: ROOM_CAPACITY,
    deep: anyDeep(peers),
    peerNames: peers.slice(0, 4).map((p) => p.username),
  };
}

// Rebuild the shared feed snapshot from the index. Lock-free by design: at a
// 2-4s TTL, the handful of pollers that race a rebuild each pay 3 pipelined
// requests — cheaper and simpler than a reliable distributed lock, and wrong
// for at most one snapshot generation.
async function rebuildFeed(r: Redis, now: number): Promise<FeedSnapshot> {
  const ids = await r.zrange<string[]>(INDEX, 0, MAX_LIST_ROOMS - 1, {
    rev: true,
  });
  if (ids.length === 0) {
    const empty: FeedSnapshot = { activeUsers: 0, rooms: [] };
    await r.set(FEED_KEY, empty, { ex: feedTtlSec() });
    return empty;
  }

  // Pass 1, every indexed room: meta + seat count. zcard may include peers up
  // to PEER_TIMEOUT_MS stale — fine for a vanity counter.
  const metaPipe = r.pipeline();
  for (const id of ids) {
    metaPipe.hgetall(metaKey(id));
    metaPipe.zcard(peersKey(id));
  }
  const metaRes = await metaPipe.exec<(RawMeta | null | number)[]>();

  let activeUsers = 0;
  const dead: string[] = [];
  const publicRooms: { id: string; meta: RoomMeta }[] = [];
  ids.forEach((id, i) => {
    const meta = parseMeta(id, metaRes[i * 2] as RawMeta | null, now);
    if (!meta) {
      // Metadata expired (TTL) — collect the dangling index entry. Without
      // this pruning the index climbs toward MAX_ROOMS dead ids and every
      // rebuild pays for all of them.
      dead.push(id);
      return;
    }
    activeUsers += Number(metaRes[i * 2 + 1]) || 0;
    // The public/private split happens HERE, before any peers are read:
    // most rooms are private and never shown, so their peer lists are never
    // fetched at all.
    if (meta.visibility === "public") publicRooms.push({ id, meta });
  });
  if (dead.length) await r.zrem(INDEX, ...dead);

  // Pass 2, public rooms only: the peer lists behind the feed cards.
  const rooms: RoomPublic[] = [];
  if (publicRooms.length > 0) {
    const peersPipe = r.pipeline();
    for (const { id } of publicRooms) {
      peersPipe.zrange(peersKey(id), 0, -1, { withScores: true });
      peersPipe.hgetall(namesKey(id));
    }
    const peersRes = await peersPipe.exec<unknown[]>();
    publicRooms.forEach(({ meta }, i) => {
      const raw = (peersRes[i * 2] ?? []) as (string | number)[];
      const names = (peersRes[i * 2 + 1] ?? {}) as Record<string, unknown>;
      const peers = toPeers(splitLive(raw, now).live, names);
      // Rooms with nobody (live) in them never show up in discovery.
      if (peers.length > 0) rooms.push(publicView(meta, peers));
    });
  }

  const snapshot: FeedSnapshot = { activeUsers, rooms };
  // The SDK JSON-serializes the object itself — no manual stringify, or the
  // read side would double-parse.
  await r.set(FEED_KEY, snapshot, { ex: feedTtlSec() });
  return snapshot;
}

// The seat decision, atomically: purge stale seats FIRST (six silent-30s
// entries must not block a live arrival — and purge-then-count in separate
// requests is exactly the 7-in-a-room-of-6 race), then admit members always,
// newcomers only below capacity, and refresh the room's TTLs. One EVALSHA
// (with automatic EVAL fallback), billed as one command.
//
// KEYS: peers zset, names hash, meta hash.
// ARGV: now(ms), timeout(ms), isMember("1"/"0"), capacity, peerId,
//       entry JSON, ttl(s).
const SEAT_LUA = `
local cutoff = '(' .. (tonumber(ARGV[1]) - tonumber(ARGV[2]))
local dead = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', cutoff)
for i = 1, #dead do
  redis.call('HDEL', KEYS[2], dead[i])
  redis.call('ZREM', KEYS[1], dead[i])
end
local joined = 0
if ARGV[3] == '1' or redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[4]) then
  redis.call('ZADD', KEYS[1], tonumber(ARGV[1]), ARGV[5])
  redis.call('HSET', KEYS[2], ARGV[5], ARGV[6])
  joined = 1
end
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[7]))
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[7]))
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[7]))
return joined
`;

let seatScript: ReturnType<Redis["createScript"]> | null = null;

async function takeSeat(
  r: Redis,
  roomId: string,
  peerId: string,
  entry: PeerEntry,
  alreadyMember: boolean,
  now: number
): Promise<boolean> {
  // Escape hatch while the script beds in: WLIS_SEAT_LUA=0 restores the
  // previous non-atomic two-step (which tolerates capacity overshoot).
  if (process.env.WLIS_SEAT_LUA === "0") {
    const joined =
      alreadyMember || (await r.zcard(peersKey(roomId))) < ROOM_CAPACITY;
    const p = r.pipeline();
    if (joined) {
      p.zadd(peersKey(roomId), { score: now, member: peerId });
      p.hset(namesKey(roomId), { [peerId]: JSON.stringify(entry) });
    }
    p.expire(metaKey(roomId), ROOM_TTL_SEC);
    p.expire(peersKey(roomId), ROOM_TTL_SEC);
    p.expire(namesKey(roomId), ROOM_TTL_SEC);
    await p.exec();
    return joined;
  }

  if (!seatScript) seatScript = r.createScript(SEAT_LUA);
  const joined = await seatScript.exec(
    [peersKey(roomId), namesKey(roomId), metaKey(roomId)],
    [
      String(now),
      String(PEER_TIMEOUT_MS),
      alreadyMember ? "1" : "0",
      String(ROOM_CAPACITY),
      peerId,
      JSON.stringify(entry),
      String(ROOM_TTL_SEC),
    ]
  );
  return Number(joined) === 1;
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
      // Private rooms never show up in discovery — code/link only.
      if (peers.length > 0 && meta.visibility === "public") {
        out.push(publicView(meta, peers));
      }
    }
    return out;
  },

  async countActivePeers() {
    const r = redis();
    const ids = await r.zrange<string[]>(INDEX, 0, MAX_LIST_ROOMS - 1, {
      rev: true,
    });
    // zcard may include peers up to PEER_TIMEOUT_MS stale — fine for a
    // vanity counter, and much cheaper than pruning every room on each poll.
    let total = 0;
    for (const id of ids) {
      total += await r.zcard(peersKey(id));
    }
    return total;
  },

  async getFeed() {
    const r = redis();
    // Served from the shared snapshot: with V visitors polling every 4s this
    // is what turns the feed from V full scans into 1 command per poll plus
    // one pipelined rebuild every few seconds, whoever gets there first.
    const cached = await r.get<FeedSnapshot>(FEED_KEY);
    if (cached) return cached;
    return rebuildFeed(r, Date.now());
  },

  async createRoom(inputMeta) {
    const r = redis();
    const now = Date.now();
    const id = sanitizeRoomId(inputMeta.id);
    if (await r.exists(metaKey(id))) return null;
    const durationSec = sanitizeDuration(inputMeta.durationSec);
    const meta: RoomMeta = {
      id,
      name: sanitizeName(inputMeta.name),
      subject: sanitizeSubject(inputMeta.subject),
      durationSec,
      startedAt: sanitizeStartedAt(inputMeta.startedAt, durationSec, now),
      visibility: sanitizeVisibility(inputMeta.visibility),
      institution: sanitizeInstitution(inputMeta.institution),
    };
    await r.hset(metaKey(id), {
      name: meta.name,
      subject: meta.subject,
      durationSec: meta.durationSec,
      startedAt: meta.startedAt,
      visibility: meta.visibility,
      institution: meta.institution,
    });
    await r.expire(metaKey(id), ROOM_TTL_SEC);
    await indexRoom(r, id, meta.startedAt);
    return meta;
  },

  // Three HTTP round-trips instead of the ~10 sequential commands this used
  // to cost — at 200 users heartbeating this path IS the load.
  async announce(input: AnnounceInput, guard?: AnnounceGuard) {
    const r = redis();
    const now = Date.now();
    const roomId = sanitizeRoomId(input.roomId);
    const peerId = sanitizePeerId(input.peerId);

    // 1: room meta + our previous entry, together.
    const readPipe = r.pipeline();
    readPipe.hgetall(metaKey(roomId));
    readPipe.hget(namesKey(roomId), peerId);
    const [rawMeta, existingRaw] = await readPipe.exec<
      [RawMeta | null, unknown]
    >();

    const meta = parseMeta(roomId, rawMeta, now);
    if (!meta) return null; // rooms are born only in createRoom

    // Refusals return before the seat is taken and before any TTL refresh —
    // a refused caller must not hold the room alive.
    if (guard && meta.visibility === "public" && !guard.callerVerified) {
      return { peers: [], room: meta, joined: false, refused: "verification" as const };
    }
    const alreadyMember = existingRaw !== null && existingRaw !== undefined;
    if (alreadyMember && guard && !guard.peerTokenValid) {
      return { peers: [], room: meta, joined: false, refused: "taken" as const };
    }

    const prev = parsePeerEntry(existingRaw, now);
    const entry: PeerEntry = {
      username: sanitizeUsername(input.username),
      joinedAt: alreadyMember ? prev.joinedAt : now,
      status: sanitizeStatus(input.status),
    };

    // 2: the seat decision — atomic in Lua (with a two-step escape hatch).
    const joined = await takeSeat(r, roomId, peerId, entry, alreadyMember, now);

    // 3: the roster we return (the Lua purge already ran, so no prune here).
    const rosterPipe = r.pipeline();
    rosterPipe.zrange(peersKey(roomId), 0, -1, { withScores: true });
    rosterPipe.hgetall(namesKey(roomId));
    const [rawZ, names] = await rosterPipe.exec<
      [(string | number)[], Record<string, unknown> | null]
    >();
    const peers = toPeers(splitLive(rawZ ?? [], now).live, names ?? {});
    return { peers, room: meta, joined };
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

// Best-effort fixed-window rate limit for mutating routes. Deliberately
// generous so it only catches floods, not legit users behind a shared NAT.
//
// One pipelined request. EXPIRE NX runs on EVERY hit, not just the first:
// paired with a bare INCR, a lost EXPIRE used to leave the counter without a
// TTL — permanently rate-limiting the key (for a campus NAT, a whole
// building) until someone deleted it by hand. NX makes the repair idempotent:
// whichever hit lands after the loss re-arms the window.
export function redisAllow(
  key: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  return redisAllowMulti([{ key, limit, windowSec }]);
}

// Several windows charged in ONE pipelined request (a heartbeat pays a
// per-seat budget and a per-address flood ceiling together). All must pass; a
// request rejected by one window still consumed the others, which is the
// pre-existing fixed-window semantic (rejected hits count).
export async function redisAllowMulti(
  entries: { key: string; limit: number; windowSec: number }[]
): Promise<boolean> {
  const r = redis();
  const p = r.pipeline();
  for (const e of entries) {
    const k = `${P}rl:${e.key}`;
    p.incr(k);
    p.expire(k, e.windowSec, "NX");
  }
  const res = await p.exec<number[]>();
  return entries.every((e, i) => Number(res[i * 2]) <= e.limit);
}
