// Small helpers shared by the API routes: client IP, size-capped JSON body
// parsing, and the standard rate-limit response.

import { NextRequest, NextResponse } from "next/server";

// The client IP, for rate limiting. Order matters: x-real-ip is written by the
// hosting proxy and cannot be spoofed from outside, whereas X-Forwarded-For is
// a list a client may prefill. Reading its LEFTMOST entry — the conventional
// choice — takes the attacker's own value, so every per-IP budget could be
// reset with one header. The rightmost entry is the one our proxy appended,
// so that is the only part of the chain worth trusting.
export function clientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",");
    return hops[hops.length - 1].trim();
  }
  return "unknown";
}

export type JsonBody<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse };

export async function readJsonBody<T>(
  req: NextRequest,
  maxBytes: number
): Promise<JsonBody<T>> {
  const raw = await req.text();
  if (raw.length > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "payload_too_large" },
        { status: 413 }
      ),
    };
  }
  try {
    const value = JSON.parse(raw) as T;
    if (value === null || typeof value !== "object") {
      throw new Error("not an object");
    }
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_json" }, { status: 400 }),
    };
  }
}

export function rateLimited(): NextResponse {
  return NextResponse.json({ error: "rate_limited" }, { status: 429 });
}
