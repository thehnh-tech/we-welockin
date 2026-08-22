// Persistence for the verification flow: pending OTP codes, verified-email
// audit records, institution requests, and rate-limit counters.
//
// MongoDB when MONGODB_URI is set; otherwise an in-process fallback — fine for
// local dev, wrong across serverless instances (same trade-off as the rooms
// store, see lib/store/).

import { getDb, isMongoConfigured } from "@/lib/db/mongo";
import { OTP_TTL_MS } from "./otp";

export type PendingCode = {
  codeHash: string;
  issuedAt: number;
  expiresAt: number;
  attempts: number;
};

export type InstitutionRequestInput = {
  email: string;
  institution: string;
  website: string;
  ip: string;
};

interface VerifyStore {
  // Upsert the pending code for an email (resets attempts).
  putCode(email: string, codeHash: string, now: number): Promise<void>;
  // Read-only peek, used for the resend cooldown. Never gate an attempt on
  // this — see claimAttempt.
  getCode(email: string, now: number): Promise<PendingCode | null>;
  // Atomically spend one verification attempt and return the record with the
  // POST-increment count. The increment must land before the caller compares
  // the code, otherwise concurrent requests all read the same pre-increment
  // count and the max-attempts cap never fires (classic check-then-act).
  claimAttempt(email: string, now: number): Promise<PendingCode | null>;
  deleteCode(email: string): Promise<void>;
  recordVerified(
    email: string,
    domain: string,
    institution: string,
    now: number
  ): Promise<void>;
  recordInstitutionRequest(
    req: InstitutionRequestInput,
    now: number
  ): Promise<void>;
  // Fixed-window rate limit; true = allowed.
  allow(
    key: string,
    limit: number,
    windowSec: number,
    now: number
  ): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

type MemState = {
  codes: Map<string, PendingCode>;
  limits: Map<string, { count: number; resetAt: number }>;
};

const g = globalThis as unknown as { __wlisVerify?: MemState };
if (!g.__wlisVerify) {
  g.__wlisVerify = { codes: new Map(), limits: new Map() };
}
const mem = g.__wlisVerify;

const memoryStore: VerifyStore = {
  async putCode(email, codeHash, now) {
    mem.codes.set(email, {
      codeHash,
      issuedAt: now,
      expiresAt: now + OTP_TTL_MS,
      attempts: 0,
    });
  },
  async getCode(email, now) {
    const c = mem.codes.get(email);
    if (!c) return null;
    if (c.expiresAt < now) {
      mem.codes.delete(email);
      return null;
    }
    // Copy: callers must never observe later mutations through this snapshot
    // (the Mongo path returns snapshots too).
    return { ...c };
  },
  async claimAttempt(email, now) {
    const c = mem.codes.get(email);
    if (!c) return null;
    if (c.expiresAt < now) {
      mem.codes.delete(email);
      return null;
    }
    // Synchronous read-modify-write: no await between them, so concurrent
    // handlers cannot interleave and each gets a distinct attempt number.
    c.attempts += 1;
    return { ...c };
  },
  async deleteCode(email) {
    mem.codes.delete(email);
  },
  async recordVerified() {
    // Audit trail only — nothing reads it in dev.
  },
  async recordInstitutionRequest(req) {
    console.log(
      `[dev] institution request: ${req.institution} (${req.email}) ${req.website}`
    );
  },
  async allow(key, limit, windowSec, now) {
    const bucket = `${key}:${Math.floor(now / (windowSec * 1000))}`;
    const cur = mem.limits.get(bucket);
    if (!cur) {
      // Opportunistic sweep so the map cannot grow unbounded.
      if (mem.limits.size > 10_000) {
        for (const [k, v] of mem.limits) {
          if (v.resetAt < now) mem.limits.delete(k);
        }
      }
      mem.limits.set(bucket, { count: 1, resetAt: now + windowSec * 1000 });
      return true;
    }
    cur.count += 1;
    return cur.count <= limit;
  },
};

// ---------------------------------------------------------------------------
// MongoDB
// ---------------------------------------------------------------------------

const mongoStore: VerifyStore = {
  async putCode(email, codeHash, now) {
    const db = await getDb();
    await db.collection("verifications").updateOne(
      { _id: email as never },
      {
        $set: {
          codeHash,
          issuedAt: now,
          expiresAt: new Date(now + OTP_TTL_MS),
          attempts: 0,
        },
      },
      { upsert: true }
    );
  },
  async getCode(email, now) {
    const db = await getDb();
    const doc = await db
      .collection("verifications")
      .findOne({ _id: email as never });
    if (!doc) return null;
    const expiresAt =
      doc.expiresAt instanceof Date ? doc.expiresAt.getTime() : 0;
    if (expiresAt < now) return null; // TTL monitor may lag — filter here
    return {
      codeHash: String(doc.codeHash ?? ""),
      issuedAt: Number(doc.issuedAt ?? 0),
      expiresAt,
      attempts: Number(doc.attempts ?? 0),
    };
  },
  async claimAttempt(email, now) {
    const db = await getDb();
    // Single atomic round-trip: $inc and read-back in one operation, so N
    // concurrent confirms get N distinct attempt numbers.
    const doc = await db
      .collection("verifications")
      .findOneAndUpdate(
        { _id: email as never },
        { $inc: { attempts: 1 } },
        { returnDocument: "after" }
      );
    if (!doc) return null;
    const expiresAt =
      doc.expiresAt instanceof Date ? doc.expiresAt.getTime() : 0;
    if (expiresAt < now) return null; // TTL monitor may lag — filter here
    return {
      codeHash: String(doc.codeHash ?? ""),
      issuedAt: Number(doc.issuedAt ?? 0),
      expiresAt,
      attempts: Number(doc.attempts ?? 1),
    };
  },
  async deleteCode(email) {
    const db = await getDb();
    await db.collection("verifications").deleteOne({ _id: email as never });
  },
  async recordVerified(email, domain, institution, now) {
    const db = await getDb();
    await db.collection("verified_emails").updateOne(
      { email },
      {
        $set: { domain, institution, lastVerifiedAt: new Date(now) },
        $setOnInsert: { firstVerifiedAt: new Date(now) },
        $inc: { verifications: 1 },
      },
      { upsert: true }
    );
  },
  async recordInstitutionRequest(req, now) {
    const db = await getDb();
    await db.collection("institution_requests").insertOne({
      email: req.email,
      institution: req.institution,
      website: req.website,
      ip: req.ip,
      status: "pending",
      createdAt: new Date(now),
    });
  },
  async allow(key, limit, windowSec, now) {
    const db = await getDb();
    // Fixed-window bucket key: upsert-safe (no filter on expiry), TTL-swept.
    const bucket = `${key}:${Math.floor(now / (windowSec * 1000))}`;
    const doc = await db.collection("rate_limits").findOneAndUpdate(
      { _id: bucket as never },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(now + windowSec * 1000) },
      },
      { upsert: true, returnDocument: "after" }
    );
    return Number(doc?.count ?? 1) <= limit;
  },
};

// ---------------------------------------------------------------------------

const store: VerifyStore = isMongoConfigured() ? mongoStore : memoryStore;

export const putCode = store.putCode.bind(store);
export const getCode = store.getCode.bind(store);
export const claimAttempt = store.claimAttempt.bind(store);
export const deleteCode = store.deleteCode.bind(store);
export const recordVerified = store.recordVerified.bind(store);
export const recordInstitutionRequest = store.recordInstitutionRequest.bind(store);

// Rate limiting must never take the feature down with it.
export async function allowVerify(
  key: string,
  limit: number,
  windowSec: number,
  now: number = Date.now()
): Promise<boolean> {
  try {
    return await store.allow(key, limit, windowSec, now);
  } catch {
    return true;
  }
}
