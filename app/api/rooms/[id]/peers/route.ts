import { NextRequest, NextResponse } from "next/server";
import {
  allowMutation,
  allowRead,
  announce,
  getRoom,
  listPeers,
  removePeer,
} from "@/lib/store";
import { ROOM_CAPACITY, sanitizeRoomId } from "@/lib/store/sanitize";
import { VERIFIED_COOKIE, verifyVerifiedToken } from "@/lib/verify/token";
import { signPeerToken, verifyPeerToken } from "@/lib/verify/peerToken";
import { clientIp, rateLimited, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;

const badRoom = () =>
  NextResponse.json({ error: "invalid_room" }, { status: 400 });

// Public view: usernames only. peerId / status / joinedAt are reserved for
// members (they get the full list from their own announce response) — exposing
// peerIds here would let anyone impersonate a member's presence entry.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await allowRead(clientIp(req)))) return rateLimited();
  const { id } = await params;
  const roomId = sanitizeRoomId(id);
  if (!roomId) return badRoom();
  const peers = await listPeers(roomId);
  return NextResponse.json({
    peers: peers.map((p) => ({ username: p.username })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const roomId = sanitizeRoomId(id);
  if (!roomId) return badRoom();

  if (!(await allowMutation(clientIp(req)))) return rateLimited();

  const body = await readJsonBody<{
    peerId?: string;
    peerToken?: string;
    username?: string;
    name?: string;
    subject?: string;
    durationSec?: number;
    startedAt?: number;
    visibility?: string;
    status?: { muted?: boolean; away?: boolean; deep?: boolean };
  }>(req, MAX_BODY_BYTES);
  if (!body.ok) return body.response;

  const peerId = (body.value.peerId ?? "").toString();
  if (!peerId) {
    return NextResponse.json({ error: "peerId required" }, { status: 400 });
  }

  const token = verifyVerifiedToken(req.cookies.get(VERIFIED_COOKIE)?.value);

  // A public room is listed for the whole internet, so its door is the
  // university check — the same one that gates creating it. A private room's
  // door is its code, which the caller already had to know to get here.
  //
  // This is the ONLY place that decision can be enforced: the client is free
  // to lie about the room in its request body, so the answer comes from the
  // room as STORED. Verified callers skip the lookup — they pass either way.
  if (!token) {
    const existing = await getRoom(roomId);
    if (existing?.visibility === "public") {
      return NextResponse.json(
        { error: "verification_required" },
        { status: 403 }
      );
    }
  }

  // Every member can see every other member's peer id — the mesh needs them to
  // place calls. So an id alone cannot be the proof of who you are: without
  // this check, anyone in the room could re-announce someone else's id and
  // take over their roster entry, name and status. Claiming an id already in
  // the room therefore requires the token minted when it first joined.
  const roster = await listPeers(roomId);
  const isTakeover = roster.some((p) => p.peerId === peerId);
  if (isTakeover && !verifyPeerToken(roomId, peerId, body.value.peerToken)) {
    return NextResponse.json({ error: "peer_taken" }, { status: 409 });
  }

  // The first announce creates the room, so "public" here is a creation
  // request for the feed: only honored with a verified-university cookie
  // (whose institution then labels the room). Anything else lands private.
  // Rooms pre-created via POST /api/rooms keep their stored meta regardless.
  let visibility = body.value.visibility;
  let institution: string | undefined;
  if (visibility === "public") {
    if (token) institution = token.institution;
    else visibility = "private";
  }

  const { peers, room, joined } = await announce({
    roomId,
    peerId,
    username: (body.value.username ?? "").toString(),
    name: body.value.name,
    subject: body.value.subject,
    durationSec: body.value.durationSec,
    startedAt: body.value.startedAt,
    visibility,
    institution,
    status: body.value.status,
  });

  // Full: say so instead of leaving someone in a room where nobody can see
  // them (the store declines to register the peer, so silence would look like
  // a broken connection).
  if (!joined) {
    return NextResponse.json(
      { error: "room_full", capacity: ROOM_CAPACITY },
      { status: 409 }
    );
  }

  // `room` is already the public meta shape.
  return NextResponse.json({
    peers,
    room,
    peerToken: signPeerToken(roomId, peerId),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const roomId = sanitizeRoomId(id);
  if (!roomId) return badRoom();

  if (!(await allowMutation(clientIp(req)))) return rateLimited();

  const peerId = req.nextUrl.searchParams.get("peerId");
  if (!peerId) {
    return NextResponse.json({ error: "peerId required" }, { status: 400 });
  }

  // Leaving is only ever your own decision. The peer id is visible to the
  // whole room, so requiring the token is what stops one participant from
  // kicking another — repeatedly, and from outside the room entirely.
  if (!verifyPeerToken(roomId, peerId, req.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await removePeer(roomId, peerId);
  return NextResponse.json({ ok: true });
}
