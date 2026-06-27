import { NextResponse } from "next/server";
import { listActiveRooms } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const rooms = await listActiveRooms();
  return NextResponse.json({ rooms });
}
