// MongoDB rooms-store backend — the shared-store option when Upstash Redis is
// not configured (both come from the same StoreBackend contract, see types.ts).
//
// Collections (TTL-swept via lib/db/mongo.ts indexes):
//   rooms       { _id: roomId, name, subject, durationSec, startedAt,
//                 visibility, institution, expiresAt }
//   room_peers  { roomId, peerId, username, joinedAt, lastSeen, status,
//                 expiresAt }  (unique index on roomId+peerId)
//
// Queries always filter on the timestamps themselves — Mongo's TTL monitor
// only sweeps about once a minute.

import type { Collection, Db } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import type {
  AnnounceGuard,
  AnnounceInput,
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

type RoomDoc = {
  _id: string;
  name: string;
  subject: string;
  durationSec: number;
  startedAt: number;
  visibility: string;
  institution: string;
  expiresAt: Date;
};

type PeerDoc = {
  roomId: string;
  peerId: string;
  username: string;
  joinedAt: number;
  lastSeen: number;
  status: { muted: boolean; away: boolean; deep: boolean; tint: string };
  expiresAt: Date;
};

const roomsCol = (db: Db): Collection<RoomDoc> => db.collection("rooms");
const peersCol = (db: Db): Collection<PeerDoc> => db.collection("room_peers");

const roomTtl = (now: number) => new Date(now + ROOM_TTL_SEC * 1000);

function docToMeta(doc: RoomDoc, now: number): RoomMeta {
  const durationSec = sanitizeDuration(Number(doc.durationSec));
  const startedAt = Number(doc.startedAt);
  return {
    id: doc._id,
    name: String(doc.name ?? "Study session"),
    subject: String(doc.subject ?? ""),
    durationSec,
    startedAt: Number.isFinite(startedAt) ? startedAt : now,
    visibility: sanitizeVisibility(doc.visibility),
    institution: String(doc.institution ?? ""),
  };
}

function toDoc(meta: RoomMeta): Omit<RoomDoc, "expiresAt"> {
  return {
    _id: meta.id,
    name: meta.name,
    subject: meta.subject,
    durationSec: meta.durationSec,
    startedAt: meta.startedAt,
    visibility: meta.visibility,
    institution: meta.institution,
  };
}

function docToPeer(doc: PeerDoc): Peer {
  return {
    peerId: doc.peerId,
    username: String(doc.username ?? "Anon"),
    lastSeen: Number(doc.lastSeen ?? 0),
    joinedAt: Number(doc.joinedAt ?? doc.lastSeen ?? 0),
    status: sanitizeStatus(doc.status),
  };
}

async function readLivePeers(
  db: Db,
  roomId: string,
  now: number
): Promise<Peer[]> {
  const docs = await peersCol(db)
    .find({ roomId, lastSeen: { $gt: now - PEER_TIMEOUT_MS } })
    .limit(ROOM_CAPACITY * 4)
    .toArray();
  return docs.map(docToPeer);
}

function publicView(meta: RoomMeta, peers: Peer[]): RoomPublic {
  return {
    ...meta,
    peerCount: peers.length,
    capacity: ROOM_CAPACITY,
    deep: peers.some((p) => p.status.deep),
    peerNames: peers.slice(0, 4).map((p) => p.username),
  };
}

export const mongoBackend: StoreBackend = {
  async getRoom(id) {
    const db = await getDb();
    const now = Date.now();
    const roomId = sanitizeRoomId(id);
    const doc = await roomsCol(db).findOne({
      _id: roomId,
      expiresAt: { $gt: new Date(now) },
    });
    if (!doc) return null;
    const peers = await readLivePeers(db, roomId, now);
    return publicView(docToMeta(doc, now), peers);
  },

  async listActiveRooms() {
    const db = await getDb();
    const now = Date.now();
    const docs = await roomsCol(db)
      .find({ visibility: "public", expiresAt: { $gt: new Date(now) } })
      .sort({ startedAt: -1 })
      .limit(MAX_LIST_ROOMS)
      .toArray();
    if (docs.length === 0) return [];

    // One peers query for every candidate room, grouped in JS.
    const peerDocs = await peersCol(db)
      .find({
        roomId: { $in: docs.map((d) => d._id) },
        lastSeen: { $gt: now - PEER_TIMEOUT_MS },
      })
      .toArray();
    const byRoom = new Map<string, Peer[]>();
    for (const p of peerDocs) {
      const list = byRoom.get(p.roomId) ?? [];
      list.push(docToPeer(p));
      byRoom.set(p.roomId, list);
    }

    const out: RoomPublic[] = [];
    for (const doc of docs) {
      const peers = byRoom.get(doc._id) ?? [];
      if (peers.length > 0) out.push(publicView(docToMeta(doc, now), peers));
    }
    return out;
  },

  async countActivePeers() {
    const db = await getDb();
    const now = Date.now();
    return peersCol(db).countDocuments({
      lastSeen: { $gt: now - PEER_TIMEOUT_MS },
    });
  },

  // 3 indexed queries total — cheap enough to skip the snapshot Redis needs.
  async getFeed() {
    const [activeUsers, rooms] = await Promise.all([
      mongoBackend.countActivePeers(),
      mongoBackend.listActiveRooms(),
    ]);
    return { activeUsers, rooms };
  },

  async createRoom(inputMeta) {
    const db = await getDb();
    const now = Date.now();
    const id = sanitizeRoomId(inputMeta.id);
    const durationSec = sanitizeDuration(inputMeta.durationSec);

    // Global cap, matching the other backends' DoS guard. Counts only live
    // rooms — expired docs the TTL monitor has not swept yet do not count.
    const live = await roomsCol(db).countDocuments(
      { expiresAt: { $gt: new Date(now) } },
      { limit: MAX_ROOMS }
    );
    if (live >= MAX_ROOMS) return null;

    const meta: RoomMeta = {
      id,
      name: sanitizeName(inputMeta.name),
      subject: sanitizeSubject(inputMeta.subject),
      durationSec,
      startedAt: sanitizeStartedAt(inputMeta.startedAt, durationSec, now),
      visibility: sanitizeVisibility(inputMeta.visibility),
      institution: sanitizeInstitution(inputMeta.institution),
    };
    try {
      await roomsCol(db).insertOne({ ...toDoc(meta), expiresAt: roomTtl(now) });
      return meta;
    } catch (err) {
      // Duplicate _id: the id is taken (possibly by an expired doc the TTL
      // monitor has not swept yet — rare enough that the caller regenerating
      // a fresh id is the simpler answer).
      if ((err as { code?: number })?.code === 11000) return null;
      throw err;
    }
  },

  async announce(input: AnnounceInput, guard?: AnnounceGuard) {
    const db = await getDb();
    const now = Date.now();
    const roomId = sanitizeRoomId(input.roomId);

    // Read WITHOUT refreshing first: a refused caller (unverified on a public
    // room, or an id it cannot prove) must not keep the room alive. The
    // expiresAt predicate matters: Mongo's TTL monitor sweeps only about once
    // a minute, so a doc can outlive its expiry — without it a heartbeat
    // landing in that window would revive a dead room's metadata, including
    // its "public" visibility and the departed creator's institution.
    const aliveDoc = await roomsCol(db).findOne({
      _id: roomId,
      expiresAt: { $gt: new Date(now) },
    });
    if (!aliveDoc) return null; // rooms are born only in createRoom
    const meta = docToMeta(aliveDoc, now);

    if (guard && meta.visibility === "public" && !guard.callerVerified) {
      return { peers: [], room: meta, joined: false, refused: "verification" as const };
    }

    const peerId = sanitizePeerId(input.peerId);
    const existing = await peersCol(db).findOne({ roomId, peerId });
    // "taken" only defends a LIVE seat (see the Redis backend): a dead entry
    // is usually our own first announce whose response was lost, and must be
    // reclaimable without a token.
    const liveMember =
      !!existing && existing.lastSeen > now - PEER_TIMEOUT_MS;
    if (liveMember && guard && !guard.peerTokenValid) {
      return { peers: [], room: meta, joined: false, refused: "taken" as const };
    }

    // Legitimate caller: NOW refresh the room's TTL.
    await roomsCol(db).updateOne(
      { _id: roomId, expiresAt: { $gt: new Date(now) } },
      { $set: { expiresAt: roomTtl(now) } }
    );

    const liveCount = await peersCol(db).countDocuments({
      roomId,
      lastSeen: { $gt: now - PEER_TIMEOUT_MS },
    });
    // Members always get back in (a heartbeat must never be evicted by the
    // cap); a newcomer only when there is a free seat.
    const joined = !!existing || liveCount < ROOM_CAPACITY;
    if (joined) {
      await peersCol(db).updateOne(
        { roomId, peerId },
        {
          $set: {
            username: sanitizeUsername(input.username),
            lastSeen: now,
            status: sanitizeStatus(input.status),
            expiresAt: roomTtl(now),
          },
          $setOnInsert: { joinedAt: now },
        },
        { upsert: true }
      );
    }

    const peers = await readLivePeers(db, roomId, now);
    return { peers, room: meta, joined };
  },

  async removePeer(roomId, peerId) {
    const db = await getDb();
    await peersCol(db).deleteOne({
      roomId: sanitizeRoomId(roomId),
      peerId: sanitizePeerId(peerId),
    });
    // Room metadata stays; its expiresAt TTL reaps it once truly abandoned.
  },

  async listPeers(roomId) {
    const db = await getDb();
    return readLivePeers(db, sanitizeRoomId(roomId), Date.now());
  },
};
