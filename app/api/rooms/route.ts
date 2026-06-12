import { NextRequest, NextResponse } from "next/server";
import { createRoom, listActiveRooms, roomPublicView } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const rooms = listActiveRooms().map(roomPublicView);
  return NextResponse.json({ rooms });
}

export async function POST(req: NextRequest) {
  let body: { name?: string; durationSec?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").toString();
  const durationSec = Number(body.durationSec);
  if (!Number.isFinite(durationSec) || durationSec < 60) {
    return NextResponse.json(
      { error: "durationSec must be at least 60" },
      { status: 400 }
    );
  }
  const room = createRoom({ name, durationSec });
  return NextResponse.json({ room: roomPublicView(room) });
}
