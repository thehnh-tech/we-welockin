import { NextRequest, NextResponse } from "next/server";
import { allowRead, getRoom } from "@/lib/store";
import { sanitizeRoomId } from "@/lib/store/sanitize";
import { clientIp, rateLimited } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limited because this endpoint answers "does this code exist, and is
  // anyone in it?". For a private room the code is the only credential, so an
  // unmetered answer here is a guessing oracle against it.
  if (!(await allowRead(clientIp(req)))) return rateLimited();

  const { id } = await params;
  const roomId = sanitizeRoomId(id);
  if (!roomId) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = await getRoom(roomId);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  return NextResponse.json({ room });
}
