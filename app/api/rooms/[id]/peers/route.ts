import { NextRequest, NextResponse } from "next/server";
import {
  allowHeartbeat,
  allowMutation,
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

const MAX_BODY_BYTES = 2048;

const badRoom = () =>
  NextResponse.json({ error: "invalid_room" }, { status: 400 });

// Presence heartbeat. It carries no room metadata — the room's name, timer,
// visibility and institution are fixed at creation (POST /api/rooms) and read
// from the store — so there is nothing here a client could lie about, and no
// way for this call to bring a room into existence at an id of its choosing.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const roomId = sanitizeRoomId(id);
  if (!roomId) return badRoom();

  const body = await readJsonBody<{
    peerId?: string;
    peerToken?: string;
    username?: string;
    status?: { muted?: boolean; away?: boolean; deep?: boolean };
  }>(req, MAX_BODY_BYTES);
  if (!body.ok) return body.response;

  const peerId = (body.value.peerId ?? "").toString();
  if (!peerId) {
    return NextResponse.json({ error: "peerId required" }, { status: 400 });
  }

  // The body is read before rate limiting (it is size-capped, so that's safe)
  // because the budget depends on who is asking: a seated member proves
  // itself with its peer token — a local HMAC check — and pays a per-seat
  // budget, so heartbeats from a whole campus behind one NAT never starve
  // each other. Everyone else (first joins) shares the per-IP budget.
  const peerTokenValid = verifyPeerToken(roomId, peerId, body.value.peerToken);
  const allowed = peerTokenValid
    ? await allowHeartbeat(clientIp(req), roomId, peerId)
    : await allowMutation(clientIp(req));
  if (!allowed) return rateLimited(10);

  // A public room is listed for the whole internet, so its door is the
  // university check — the same one that gates creating it. A private room's
  // door is its code, which the caller already had to know to get here.
  //
  // Checked BEFORE announcing, and against the room as STORED. Announcing
  // first and undoing it would briefly seat an unverified caller, which is
  // long enough to show up in a feed poll. A verified caller skips the lookup
  // entirely — they pass either way.
  if (!verifyVerifiedToken(req.cookies.get(VERIFIED_COOKIE)?.value)) {
    const existing = await getRoom(roomId);
    if (!existing) {
      return NextResponse.json({ error: "room_not_found" }, { status: 404 });
    }
    if (existing.visibility === "public") {
      return NextResponse.json(
        { error: "verification_required" },
        { status: 403 }
      );
    }
  }

  // Every member can see every other member's peer id — the mesh needs them to
  // place calls. So an id alone cannot be proof of who you are: without this
  // check, anyone in the room could re-announce someone else's id and take
  // over their roster entry, name and status. Claiming an id already in the
  // room therefore requires the token minted when it first joined.
  if (!peerTokenValid) {
    const roster = await listPeers(roomId);
    if (roster.some((p) => p.peerId === peerId)) {
      return NextResponse.json({ error: "peer_taken" }, { status: 409 });
    }
  }

  const result = await announce({
    roomId,
    peerId,
    username: (body.value.username ?? "").toString(),
    status: body.value.status,
  });

  // The room has ended (or never existed). Ephemeral by design — say so
  // rather than starting a fresh room under the same link.
  if (!result) {
    return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  }
  const { peers, room, joined } = result;

  // Full: say so instead of leaving someone in a room where nobody can see
  // them (the store declines to register the peer, so silence would look like
  // a broken connection).
  if (!joined) {
    return NextResponse.json(
      { error: "room_full", capacity: ROOM_CAPACITY },
      { status: 409 }
    );
  }

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

  if (!(await allowMutation(clientIp(req)))) return rateLimited(10);

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
