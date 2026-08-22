// Who am I, university-wise? GET reads the signed cookie; DELETE clears it.

import { NextRequest, NextResponse } from "next/server";
import { VERIFIED_COOKIE, verifyVerifiedToken } from "@/lib/verify/token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const payload = verifyVerifiedToken(req.cookies.get(VERIFIED_COOKIE)?.value);
  if (!payload) return NextResponse.json({ verified: false });
  return NextResponse.json({
    verified: true,
    email: payload.email,
    domain: payload.domain,
    institution: payload.institution,
  });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VERIFIED_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return res;
}
