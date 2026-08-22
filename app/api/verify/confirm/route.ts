// Step 2 of university verification: check the one-time code and, on success,
// set the signed httpOnly cookie that unlocks public-room creation.

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkUniversityEmail } from "@/lib/university";
import { hashOtp, normalizeOtpInput, OTP_MAX_ATTEMPTS } from "@/lib/verify/otp";
import {
  allowVerify,
  claimAttempt,
  deleteCode,
  recordVerified,
} from "@/lib/verify/store";
import {
  getAuthSecret,
  signVerifiedToken,
  TOKEN_TTL_SEC,
  VERIFIED_COOKIE,
} from "@/lib/verify/token";
import { clientIp, rateLimited, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();
  if (!(await allowVerify(`vc:ip:${ip}`, 30, 600, now))) return rateLimited();

  const body = await readJsonBody<{ email?: unknown; code?: unknown }>(
    req,
    1024
  );
  if (!body.ok) return body.response;

  // Re-run the dataset check: it both normalizes the email and yields the
  // institution name for the token.
  const check = checkUniversityEmail(String(body.value.email ?? ""));
  const code = normalizeOtpInput(String(body.value.code ?? ""));
  if (!check.ok || !code) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { email, match } = check;

  // Per-email ceiling on top of the per-attempt cap: a client that keeps
  // requesting fresh codes still cannot grind the 6-digit space, even from a
  // pool of IPs (the per-IP key above is only as trustworthy as the proxy
  // chain that sets X-Forwarded-For).
  if (!(await allowVerify(`vc:em:${email}`, 25, 3600, now))) {
    return rateLimited();
  }

  // Spend an attempt BEFORE comparing: the increment is atomic, so parallel
  // requests can never all pass the cap on the same stale count.
  const rec = await claimAttempt(email, now);
  if (!rec) {
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }
  if (rec.attempts > OTP_MAX_ATTEMPTS) {
    await deleteCode(email);
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }
  if (!hashesMatch(rec.codeHash, hashOtp(email, code, getAuthSecret()))) {
    const attemptsLeft = OTP_MAX_ATTEMPTS - rec.attempts;
    if (attemptsLeft <= 0) await deleteCode(email); // last try burned the code
    return NextResponse.json(
      { error: "wrong_code", attemptsLeft: Math.max(0, attemptsLeft) },
      { status: 400 }
    );
  }

  await deleteCode(email);
  try {
    await recordVerified(email, match.domain, match.institution, now);
  } catch (err) {
    console.error("[verify] recordVerified failed:", err); // audit only
  }

  const token = signVerifiedToken({
    email,
    domain: match.domain,
    institution: match.institution,
    exp: Math.floor(now / 1000) + TOKEN_TTL_SEC,
  });
  const res = NextResponse.json({
    ok: true,
    institution: match.institution,
    domain: match.domain,
  });
  res.cookies.set(VERIFIED_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TOKEN_TTL_SEC,
    path: "/",
  });
  return res;
}
