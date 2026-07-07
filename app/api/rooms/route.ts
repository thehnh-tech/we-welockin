import { NextResponse } from "next/server";
import { countActivePeers } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Every room is private now — there is no public directory. This endpoint
// only reports the active-user counter shown on the home page.
// Marketing floor: the counter starts at 130 so it never looks empty.
const BASE_ACTIVE_USERS = 130;

export async function GET() {
  const active = await countActivePeers();
  return NextResponse.json({ activeUsers: BASE_ACTIVE_USERS + active });
}
