import { NextRequest, NextResponse } from "next/server";
import {
  allowMutation,
  countActivePeers,
  createRoom,
  listActiveRooms,
  type RoomMeta,
} from "@/lib/store";
import { DEFAULT_DURATION_SEC } from "@/lib/store/sanitize";
import { generateRoomId } from "@/lib/roomCode";
import { VERIFIED_COOKIE, verifyVerifiedToken } from "@/lib/verify/token";
import { allowVerify } from "@/lib/verify/store";
import { getDb, isMongoConfigured } from "@/lib/db/mongo";
import { clientIp, rateLimited, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Marketing floor: the counter starts at 130 so it never looks empty.
const BASE_ACTIVE_USERS = 130;

// How long a public session stays in the analytics archive.
const ARCHIVE_TTL_MS = 180 * 24 * 3600 * 1000; // 180 days

// The home page polls this: active-user counter + the public feed.
export async function GET() {
  const [active, rooms] = await Promise.all([
    countActivePeers(),
    listActiveRooms(),
  ]);
  return NextResponse.json({
    activeUsers: BASE_ACTIVE_USERS + active,
    rooms,
  });
}

// The ONLY way a room comes into existence. Ids are minted here, never
// accepted from the caller: that is what stops someone from creating a room at
// an id they read off the feed and waiting there for the people who return to
// an old link. Rooms stay ephemeral — they still expire — but a dead link now
// stays dead instead of quietly reopening as somebody else's room.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!(await allowMutation(ip))) return rateLimited();
  // A far tighter budget than other writes: room creation consumes a slot in
  // the global MAX_ROOMS cap, so an unmetered creator could fill it and stop
  // everyone else from starting a session.
  if (!(await allowVerify(`rc:ip:${ip}`, 30, 3600))) return rateLimited();

  const body = await readJsonBody<{
    name?: unknown;
    subject?: unknown;
    durationSec?: unknown;
    visibility?: unknown;
  }>(req, 4096);
  if (!body.ok) return body.response;

  const wantsPublic = body.value.visibility === "public";
  let institution = "";
  let creator: { email: string; domain: string } | null = null;
  if (wantsPublic) {
    const token = verifyVerifiedToken(req.cookies.get(VERIFIED_COOKIE)?.value);
    if (!token) {
      return NextResponse.json(
        { error: "verification_required" },
        { status: 401 }
      );
    }
    institution = token.institution;
    creator = { email: token.email, domain: token.domain };
  }

  const now = Date.now();
  // Per-creator ceiling on top of the per-IP one: the cookie is the identity
  // here, so one verified student cannot flood the feed (or the archive) by
  // moving between networks.
  if (creator && !(await allowVerify(`rc:em:${creator.email}`, 30, 3600, now))) {
    return rateLimited();
  }

  const requested = {
    name: String(body.value.name ?? ""),
    subject: String(body.value.subject ?? ""),
    // Absent duration means "use the default", exactly as on the announce
    // path — coercing undefined to 0 here would silently store a 60s room.
    durationSec:
      body.value.durationSec === undefined
        ? DEFAULT_DURATION_SEC
        : Number(body.value.durationSec),
    startedAt: now,
    visibility: wantsPublic ? ("public" as const) : ("private" as const),
    institution,
  };

  // Collisions are ~impossible at our id space, but createRoom refusing an
  // existing id makes retrying trivial, so do. `meta` is what was actually
  // STORED (sanitized and clamped) — never echo the request back, or the
  // creator's timer would disagree with everyone else's.
  let meta: RoomMeta | null = null;
  for (let attempt = 0; attempt < 3 && !meta; attempt++) {
    meta = await createRoom({ ...requested, id: generateRoomId() });
  }
  if (!meta) {
    return NextResponse.json({ error: "room_unavailable" }, { status: 503 });
  }

  // Feed archive (analytics / history) — best-effort, never blocks creation.
  // Stores the sanitized meta and expires on its own (see lib/db/mongo.ts).
  if (wantsPublic && creator && isMongoConfigured()) {
    try {
      const db = await getDb();
      await db.collection("public_sessions").insertOne({
        roomId: meta.id,
        name: meta.name,
        subject: meta.subject,
        durationSec: meta.durationSec,
        institution,
        creatorEmail: creator.email,
        creatorDomain: creator.domain,
        createdAt: new Date(now),
        expiresAt: new Date(now + ARCHIVE_TTL_MS),
      });
    } catch (err) {
      console.error("[rooms] feed archive failed:", err);
    }
  }

  return NextResponse.json({ room: meta });
}
