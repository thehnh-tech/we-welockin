// Outbound email via Resend: OTP verification codes and institution requests.
//
// Local dev without RESEND_API_KEY: the code is printed to the server console
// instead of being sent, so the whole flow stays testable offline. In
// production a missing key is a hard error (a silently logged code would look
// like a working flow that never delivers).

import { Resend } from "resend";

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

let client: Resend | null = null;
function resend(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

function fromAddress(): string {
  // onboarding@resend.dev is Resend's sandbox sender (only delivers to the
  // account owner) — set RESEND_FROM to a verified domain for real traffic.
  return process.env.RESEND_FROM || "welock.in <onboarding@resend.dev>";
}

const BRAND = {
  paper: "#faf8f3",
  card: "#f4f2ec",
  ink: "#1a1714",
  text2: "#5b5448",
  accent: "#bd2f1e",
  hairline: "#e6e2d8",
};

function shell(inner: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${BRAND.paper};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.paper};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;">
<tr><td style="font-family:Figtree,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:17px;font-weight:700;color:${BRAND.ink};padding:0 4px 14px;">
  welock<span style="color:${BRAND.accent};">.in</span>
</td></tr>
<tr><td style="background:#fffefb;border:1px solid ${BRAND.hairline};border-radius:16px;padding:28px;font-family:Figtree,-apple-system,'Segoe UI',Roboto,sans-serif;">
${inner}
</td></tr>
<tr><td style="font-family:Figtree,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:12px;color:${BRAND.text2};padding:14px 4px 0;">
  Lock in. Study together.
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export async function sendVerificationEmail(
  to: string,
  code: string,
  institution: string
): Promise<void> {
  if (!isResendConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set");
    }
    console.log(`[dev] verification code for ${to}: ${code}`);
    return;
  }
  const inner = `
<p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${BRAND.text2};">Verify your email</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:${BRAND.ink};">
  Here's your code to unlock public rooms for <strong>${escapeHtml(institution)}</strong>:
</p>
<p style="margin:0 0 18px;padding:14px 0;text-align:center;background:${BRAND.card};border-radius:12px;font-size:32px;font-weight:700;letter-spacing:.35em;text-indent:.35em;color:${BRAND.ink};">${code}</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:${BRAND.text2};">
  The code expires in 10 minutes. If you didn't request it, you can ignore this email.
</p>`;
  const { error } = await resend().emails.send({
    from: fromAddress(),
    to,
    subject: `${code} — your welock.in code`,
    html: shell(inner),
    text: `Your welock.in verification code: ${code}\nIt expires in 10 minutes.`,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendInstitutionRequestEmail(req: {
  email: string;
  institution: string;
  website: string;
}): Promise<void> {
  const to = process.env.INSTITUTION_REQUESTS_TO;
  // Without a recipient the request is still recorded in the database; the
  // email notification is just skipped.
  if (!to) return;
  if (!isResendConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[dev] institution request email skipped (no RESEND_API_KEY): ${req.institution}`
      );
      return;
    }
    throw new Error("RESEND_API_KEY is not set");
  }
  const inner = `
<p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${BRAND.text2};">Institution request</p>
<p style="margin:0;font-size:15px;line-height:1.7;color:${BRAND.ink};">
  <strong>School:</strong> ${escapeHtml(req.institution)}<br/>
  <strong>Requested by:</strong> ${escapeHtml(req.email)}<br/>
  <strong>Website:</strong> ${escapeHtml(req.website || "—")}
</p>`;
  const { error } = await resend().emails.send({
    from: fromAddress(),
    to,
    subject: `Institution request: ${req.institution}`,
    html: shell(inner),
    text: `Institution request\nSchool: ${req.institution}\nRequested by: ${req.email}\nWebsite: ${req.website || "-"}`,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
