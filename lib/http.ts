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

// Refuse a request that another site made the browser send.
//
// Two checks, because either alone has a gap. A cross-site <form> can only
// send text/plain, urlencoded or multipart — never application/json — so
// demanding JSON blocks the form trick (a body like
// `{"email":"a@b.c","x":"` … `"}` is valid JSON when posted as text/plain).
// And a cross-site fetch that DOES set application/json triggers a CORS
// preflight this app never answers. The Origin check then covers anything
// that slips past content-type reasoning.
//
// This matters most on /api/verify/confirm: without it, a page could make a
// visitor's browser accept the ATTACKER's verification cookie, so every
// public room that person went on to create would carry the attacker's email
// and institution.
export function isCrossSite(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false; // no Origin at all: fall back to content-type
  try {
    return new URL(origin).host !== req.headers.get("host");
  } catch {
    return true; // unparseable Origin is not something to trust
  }
}

export function crossSiteRejected(): NextResponse {
  return NextResponse.json({ error: "cross_site" }, { status: 403 });
}

export async function readJsonBody<T>(
  req: NextRequest,
  maxBytes: number
): Promise<JsonBody<T>> {
  if (isCrossSite(req)) {
    return { ok: false, response: crossSiteRejected() };
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().split(";")[0].trim().startsWith("application/json")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unsupported_media_type" },
        { status: 415 }
      ),
    };
  }
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

// `retryAfterSec` is per call site — the windows behind this range from a
// minute (heartbeats) to an hour (room creation), so no single default fits.
export function rateLimited(retryAfterSec?: number): NextResponse {
  const res = NextResponse.json({ error: "rate_limited" }, { status: 429 });
  if (retryAfterSec !== undefined) {
    res.headers.set("Retry-After", String(retryAfterSec));
  }
  return res;
}
