import { NextRequest, NextResponse } from "next/server";
import { allowMutation, announce, listPeers, removePeer } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

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

  if (!(await allowMutation(clientIp(req)))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: {
    peerId?: string;
    username?: string;
    name?: string;
    subject?: string;
    durationSec?: number;
    startedAt?: number;
    visibility?: string;
    status?: { muted?: boolean; away?: boolean; deep?: boolean };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const peerId = (body.peerId ?? "").toString();
  if (!peerId) {
    return NextResponse.json({ error: "peerId required" }, { status: 400 });
  }

  const { peers, room } = await announce({
    roomId: id,
    peerId,
    username: (body.username ?? "").toString(),
    name: body.name,
    subject: body.subject,
    durationSec: body.durationSec,
    startedAt: body.startedAt,
    visibility: body.visibility,
    status: body.status,
  });
  // `room` is already the public meta shape { id, name, durationSec, startedAt }.
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
