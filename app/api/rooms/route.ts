import { NextResponse } from "next/server";
import { listActiveRooms, roomPublicView } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const rooms = listActiveRooms().map(roomPublicView);
  return NextResponse.json({ rooms });
}
