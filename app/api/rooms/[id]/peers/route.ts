import { NextRequest, NextResponse } from "next/server";
import { announce, listPeers, removePeer } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const peers = listPeers(id);
  return NextResponse.json({ peers });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: {
    peerId?: string;
    username?: string;
    name?: string;
    durationSec?: number;
    startedAt?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const peerId = (body.peerId ?? "").toString();
  if (!peerId) {
    return NextResponse.json({ error: "peerId required" }, { status: 400 });
  }
  const { peers, room } = announce({
    roomId: id,
    peerId,
    username: (body.username ?? "").toString(),
    name: body.name,
    durationSec: body.durationSec,
    startedAt: body.startedAt,
  });
  return NextResponse.json({
    peers,
    room: {
      id: room.id,
      name: room.name,
      durationSec: room.durationSec,
      startedAt: room.startedAt,
    },
  });
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
  removePeer(id, peerId);
  return NextResponse.json({ ok: true });
}
