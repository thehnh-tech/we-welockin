import { NextResponse } from "next/server";
import { activeBackendName } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Deployment sanity, for humans and uptime checks. `degraded` flags the two
// misconfigurations that ship green and only break under real traffic: the
// per-instance memory store on a serverless host, and a missing auth secret
// (which 500s verification and announces in production). Deliberately no
// detail about WHICH secret is missing — this endpoint is public.
export async function GET() {
  const backend = activeBackendName();
  const missingSecret =
    process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET;
  const degraded = (!!process.env.VERCEL && backend === "memory") || missingSecret;
  return NextResponse.json({ backend, degraded });
}
