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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const peers = await listPeers(id);
  return NextResponse.json({ peers });
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
    durationSec?: number;
    startedAt?: number;
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
    durationSec: body.durationSec,
    startedAt: body.startedAt,
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
