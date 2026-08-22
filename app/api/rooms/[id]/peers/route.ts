import { NextRequest, NextResponse } from "next/server";
import { allowMutation, announce, listPeers, removePeer } from "@/lib/store";
import { VERIFIED_COOKIE, verifyVerifiedToken } from "@/lib/verify/token";
import { clientIp, rateLimited, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;

// Public view: usernames only. peerId / status / joinedAt are reserved for
// members (they get the full list from their own announce response) — exposing
// peerIds here would let anyone impersonate a member's presence entry.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const peers = await listPeers(id);
  return NextResponse.json({
    peers: peers.map((p) => ({ username: p.username })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await allowMutation(clientIp(req)))) return rateLimited();

  const body = await readJsonBody<{
    peerId?: string;
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

  // The first announce creates the room, so "public" here is a creation
  // request for the feed: only honored with a verified-university cookie
  // (whose institution then labels the room). Anything else lands private.
  // Rooms pre-created via POST /api/rooms keep their stored meta regardless.
  let visibility = body.value.visibility;
  let institution: string | undefined;
  if (visibility === "public") {
    const token = verifyVerifiedToken(req.cookies.get(VERIFIED_COOKIE)?.value);
    if (token) institution = token.institution;
    else visibility = "private";
  }

  const { peers, room } = await announce({
    roomId: id,
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
  // `room` is already the public meta shape.
  return NextResponse.json({ peers, room });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const peerId = req.nextUrl.searchParams.get("peerId");
  if (!peerId) {
    return NextResponse.json({ error: "peerId required" }, { status: 400 });
  }
  await removePeer(id, peerId);
  return NextResponse.json({ ok: true });
}
