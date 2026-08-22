import { NextRequest, NextResponse } from "next/server";
import {
  allowHeartbeat,
  allowJoin,
  allowMutation,
  announce,
  removePeer,
} from "@/lib/store";
import { ROOM_CAPACITY, sanitizeRoomId } from "@/lib/store/sanitize";
import { VERIFIED_COOKIE, verifyVerifiedToken } from "@/lib/verify/token";
import { signPeerToken, verifyPeerToken } from "@/lib/verify/peerToken";
import {
  clientIp,
  crossSiteRejected,
  isCrossSite,
  rateLimited,
  readJsonBody,
} from "@/lib/http";

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
  const verified = verifyVerifiedToken(req.cookies.get(VERIFIED_COOKIE)?.value);
  const ip = clientIp(req);

  if (peerTokenValid) {
    if (!(await allowHeartbeat(ip, roomId, peerId))) return rateLimited(10);
  } else {
    // Taking a NEW seat. Seats are a public room's scarcest resource — six per
    // room — so without a budget of its own one caller could sit in every room
    // on the feed at once and leave nothing for the students it is meant for.
    // Keyed on the verified account when there is one, so switching networks
    // does not reset it.
    if (!(await allowMutation(ip))) return rateLimited(10);
    if (!(await allowJoin(ip, verified?.email ?? ip))) return rateLimited(60);
  }

  // Both doors are enforced INSIDE announce, against the room as STORED and
  // in the same breath as the seat decision, so nothing needs a separate
  // read here:
  //  - a public room is listed for the whole internet, so its door is the
  //    university check (a private room's door is its code, which the caller
  //    already had to know to get here);
  //  - every member can see every other member's peer id — the mesh needs
  //    them to place calls — so claiming an id that already has an entry
  //    requires the token minted when it first joined.
  const result = await announce(
    {
      roomId,
      peerId,
      username: (body.value.username ?? "").toString(),
      status: body.value.status,
    },
    { callerVerified: !!verified, peerTokenValid }
  );

  // The room has ended (or never existed). Ephemeral by design — say so
  // rather than starting a fresh room under the same link.
  if (!result) {
    return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  }
  if (result.refused === "verification") {
    return NextResponse.json(
      { error: "verification_required" },
      { status: 403 }
    );
  }
  if (result.refused === "taken") {
    return NextResponse.json({ error: "peer_taken" }, { status: 409 });
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

  // No JSON body here, so this route needs its own cross-site guard rather
  // than inheriting readJsonBody's.
  if (isCrossSite(req)) return crossSiteRejected();

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
