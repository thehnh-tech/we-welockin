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
    .limit(MAX_PEERS_PER_ROOM * 2)
    .toArray();
  return docs.map(docToPeer);
}

function publicView(meta: RoomMeta, peers: Peer[]): RoomPublic {
  return {
    ...meta,
    peerCount: peers.length,
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

  async announce(input: AnnounceInput) {
    const db = await getDb();
    const now = Date.now();
    const roomId = sanitizeRoomId(input.roomId);
    const durationSec = sanitizeDuration(input.durationSec);

    // Refresh the TTL of a room that is still LIVE. The expiresAt predicate
    // matters: Mongo's TTL monitor sweeps only about once a minute, so without
    // it an announce landing in that window would revive a dead room's
    // metadata — including its "public" visibility and the departed creator's
    // institution — putting an abandoned session back on the feed. Redis and
    // memory both hand out a fresh room there, so this keeps the three
    // backends in agreement.
    const aliveDoc = await roomsCol(db).findOneAndUpdate(
      { _id: roomId, expiresAt: { $gt: new Date(now) } },
      { $set: { expiresAt: roomTtl(now) } },
      { returnDocument: "after" }
    );

    let meta: RoomMeta;
    if (aliveDoc) {
      meta = docToMeta(aliveDoc as RoomDoc, now);
    } else {
      // Missing, or expired-but-unswept: start over from this announce.
      meta = {
        id: roomId,
        name: sanitizeName(input.name),
        subject: sanitizeSubject(input.subject),
        durationSec,
        startedAt: sanitizeStartedAt(input.startedAt, durationSec, now),
        visibility: sanitizeVisibility(input.visibility),
        institution: sanitizeInstitution(input.institution),
      };
      await roomsCol(db).replaceOne(
        { _id: roomId },
        { ...toDoc(meta), expiresAt: roomTtl(now) },
        { upsert: true }
      );
      // Drop the dead session's leftover presence rows so the new room does
      // not inherit ghosts.
      await peersCol(db).deleteMany({ roomId });
    }

    const peerId = sanitizePeerId(input.peerId);
    const existing = await peersCol(db).findOne({ roomId, peerId });
    const liveCount = await peersCol(db).countDocuments({
      roomId,
      lastSeen: { $gt: now - PEER_TIMEOUT_MS },
    });
    // Soft per-room cap: silently skip a brand-new peer once full.
    if (existing || liveCount < MAX_PEERS_PER_ROOM) {
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
    return { peers, room: meta };
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
