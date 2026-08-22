// Signed university-verification token, carried in an httpOnly cookie.
// Format: base64url(payload JSON) + "." + base64url(HMAC-SHA256(payload)).
// Stateless — API routes trust the signature, no DB read per request.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const VERIFIED_COOKIE = "wl_uni";
export const TOKEN_TTL_SEC = 30 * 24 * 3600; // re-verify monthly

export type VerifiedPayload = {
  email: string;
  domain: string; // matched dataset domain (e.g. "epfl.ch")
  institution: string; // display name from the dataset
  exp: number; // epoch seconds
};

const g = globalThis as unknown as { __wlisDevSecret?: string };

export function getAuthSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    // Fail loudly: a silent fallback would mint tokens that differ across
    // serverless instances and die on every deploy.
    throw new Error("AUTH_SECRET must be set in production");
  }
  if (!g.__wlisDevSecret) g.__wlisDevSecret = randomBytes(32).toString("hex");
  return g.__wlisDevSecret;
}

const b64url = (b: Buffer) => b.toString("base64url");

function hmac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signVerifiedToken(
  payload: VerifiedPayload,
  secret: string = getAuthSecret()
): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${b64url(hmac(body, secret))}`;
}

export function verifyVerifiedToken(
  token: string | undefined | null,
  secret?: string,
  now: number = Date.now()
): VerifiedPayload | null {
  // Answer the no-cookie case before resolving the secret. As a default
  // parameter, getAuthSecret() ran on every call — so a visitor with no cookie
  // still turned a missing AUTH_SECRET into a 500 on /api/verify/status,
  // which the home page hits on every load.
  if (!token || token.length > 2048) return null;
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: Buffer;
  let got: Buffer;
  try {
    expected = hmac(body, secret ?? getAuthSecret());
    got = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const p = parsed as Record<string, unknown>;
  if (
    typeof p?.email !== "string" ||
    typeof p?.domain !== "string" ||
    typeof p?.institution !== "string" ||
    typeof p?.exp !== "number"
  ) {
    return null;
  }
  if (p.exp * 1000 < now) return null;
  return {
    email: p.email,
    domain: p.domain,
    institution: p.institution,
    exp: p.exp,
  };
}
