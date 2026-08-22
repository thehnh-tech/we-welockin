// Step 1 of university verification: validate the address against the
// dataset, then email a one-time code via Resend.

import { NextRequest, NextResponse } from "next/server";
import { checkUniversityEmail } from "@/lib/university";
import {
  generateOtp,
  hashOtp,
  OTP_RESEND_COOLDOWN_SEC,
} from "@/lib/verify/otp";
import { allowVerify, getCode, putCode } from "@/lib/verify/store";
import { getAuthSecret } from "@/lib/verify/token";
import { sendVerificationEmail } from "@/lib/email/resend";
import { clientIp, rateLimited, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = await readJsonBody<{ email?: unknown }>(req, 1024);
  if (!body.ok) return body.response;

  const check = checkUniversityEmail(String(body.value.email ?? ""));
  if (!check.ok) {
    // reason: "invalid" | "personal" | "unknown" — the client maps each to
    // its own message ("unknown" surfaces the request-an-institution CTA).
    return NextResponse.json(
      { error: check.reason, domain: check.domain ?? null },
      { status: 422 }
    );
  }
  const { email, match } = check;
  const now = Date.now();

  // Layered limits: per-IP flood guard, per-email budget, resend cooldown.
  // The IP guard is wide on purpose — the launch-night audience is a lecture
  // hall of students behind one campus NAT, and at 10/10min it took an hour
  // to onboard a library. The real cost ceiling (emails sent) is carried by
  // the per-email budget and cooldown below.
  if (!(await allowVerify(`vr:ip:${ip}`, 100, 600, now))) return rateLimited();
  if (!(await allowVerify(`vr:em:${email}`, 6, 3600, now))) return rateLimited();
  const existing = await getCode(email, now);
  if (existing && now - existing.issuedAt < OTP_RESEND_COOLDOWN_SEC * 1000) {
    const retryAfterSec = Math.ceil(
      (existing.issuedAt + OTP_RESEND_COOLDOWN_SEC * 1000 - now) / 1000
    );
    return NextResponse.json(
      { error: "cooldown", retryAfterSec },
      { status: 429 }
    );
  }

  const code = generateOtp();
  await putCode(email, hashOtp(email, code, getAuthSecret()), now);
  try {
    await sendVerificationEmail(email, code, match.institution);
  } catch (err) {
    console.error("[verify] sending code failed:", err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    institution: match.institution,
    domain: match.domain,
  });
}
