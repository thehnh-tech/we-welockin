// Small helpers shared by the API routes: client IP, size-capped JSON body
// parsing, and the standard rate-limit response.

import { NextRequest, NextResponse } from "next/server";

export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
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
