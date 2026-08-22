// One-time codes for university-email verification.

import { createHash, randomInt } from "node:crypto";

export const OTP_TTL_MS = 10 * 60_000; // a code lives 10 minutes
export const OTP_MAX_ATTEMPTS = 5; // wrong guesses before the code burns
export const OTP_RESEND_COOLDOWN_SEC = 60;

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// The hash binds the code to the email + server secret, so a leaked DB row
// reveals nothing and a code for one address is useless for another.
export function hashOtp(email: string, code: string, secret: string): string {
  return createHash("sha256").update(`${email}:${code}:${secret}`).digest("hex");
}

// Accepts "123456", "123 456", "123-456" — anything with exactly 6 digits.
export function normalizeOtpInput(raw: string): string | null {
  const code = raw.replace(/\D/g, "");
  return code.length === 6 ? code : null;
}
