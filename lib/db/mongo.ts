// MongoDB access — lazy, cached across serverless invocations and dev HMR
// reloads (standard Next.js pattern). Used by the verification flow
// (lib/verify/store.ts), the feed archive, and the Mongo rooms backend
// (lib/store/mongo.ts).

import { Db, MongoClient } from "mongodb";

export function isMongoConfigured(): boolean {
  return !!process.env.MONGODB_URI;
}

const g = globalThis as unknown as {
  __wlisMongo?: {
    clientPromise: Promise<MongoClient>;
    indexesEnsured: boolean;
  };
};

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!g.__wlisMongo) {
    // Small pool: the driver's default of 100 is per PROCESS, and serverless
    // scale-out multiplies it — a handful of busy instances would exhaust a
    // free-tier Atlas cluster's 500-connection cap on their own.
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
      maxIdleTimeMS: 60_000,
    });
    g.__wlisMongo = { clientPromise: client.connect(), indexesEnsured: false };
  }
  const client = await g.__wlisMongo.clientPromise;
  const db = client.db(process.env.MONGODB_DB || "welockin");
  if (!g.__wlisMongo.indexesEnsured) {
    g.__wlisMongo.indexesEnsured = true; // once per process
    ensureIndexes(db).catch((err) => {
      console.error("[mongo] ensureIndexes failed:", err);
      if (g.__wlisMongo) g.__wlisMongo.indexesEnsured = false; // retry next call
    });
  }
  return db;
}

// TTL indexes let Mongo garbage-collect ephemeral docs (OTP codes, rate-limit
// windows, room presence). Queries still filter on the timestamps themselves:
// the TTL monitor only sweeps about once a minute.
async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db
      .collection("verifications")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection("rate_limits")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection("verified_emails")
      .createIndex({ email: 1 }, { unique: true }),
    db.collection("institution_requests").createIndex({ createdAt: -1 }),
    db
      .collection("rooms")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection("room_peers")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection("room_peers")
      .createIndex({ roomId: 1, peerId: 1 }, { unique: true }),
    db.collection("public_sessions").createIndex({ createdAt: -1 }),
    // The feed archive is analytics, not a permanent record: expire it so the
    // collection (which holds creator emails) cannot grow without bound.
    db
      .collection("public_sessions")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
