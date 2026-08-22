// "Request an institution": a school missing from the dataset can be
// requested here — recorded in MongoDB and forwarded to the site admin via
// Resend (INSTITUTION_REQUESTS_TO).

import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/university";
import { allowVerify, recordInstitutionRequest } from "@/lib/verify/store";
import { sendInstitutionRequestEmail } from "@/lib/email/resend";
import { clientIp, rateLimited, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");
const clean = (v: unknown, max: number) =>
  String(v ?? "").replace(CONTROL_CHARS, "").trim().slice(0, max);

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();
  if (!(await allowVerify(`ir:ip:${ip}`, 5, 86_400, now))) return rateLimited();

  const body = await readJsonBody<{
    email?: unknown;
    institution?: unknown;
    website?: unknown;
  }>(req, 2048);
  if (!body.ok) return body.response;

  const email = normalizeEmail(clean(body.value.email, 254));
  const institution = clean(body.value.institution, 120);
  const website = clean(body.value.website, 200);
  if (!isValidEmail(email) || institution.length < 2) {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  try {
    await recordInstitutionRequest({ email, institution, website, ip }, now);
  } catch (err) {
    console.error("[institutions] recording request failed:", err);
    return NextResponse.json({ error: "store_failed" }, { status: 500 });
  }
  try {
    await sendInstitutionRequestEmail({ email, institution, website });
  } catch (err) {
    // The request is safely recorded; the admin notification is best-effort.
    console.error("[institutions] notification email failed:", err);
  }

  return NextResponse.json({ ok: true });
}
