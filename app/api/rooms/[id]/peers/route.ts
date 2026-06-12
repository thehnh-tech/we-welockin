import { NextRequest, NextResponse } from "next/server";
import { listPeers, removePeer, upsertPeer } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const peers = listPeers(id);
  if (!peers) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  return NextResponse.json({ peers });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { peerId?: string; username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const peerId = (body.peerId ?? "").toString();
  const username = (body.username ?? "").toString();
  if (!peerId) {
    return NextResponse.json({ error: "peerId required" }, { status: 400 });
  }
  const res = upsertPeer(id, peerId, username);
  if (!res.ok) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  return NextResponse.json({ peers: res.peers });
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
