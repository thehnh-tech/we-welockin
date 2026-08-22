// University-email validation against the dataset in domains.json, generated
// by scripts/build-university-domains.mjs from
// github.com/glean/university-email-domains (domain -> institution name).
//
// Server-only: the JSON weighs ~360KB — never import from a client component
// (clients talk to /api/verify/* instead).

import domains from "./domains.json";

export type UniversityMatch = { domain: string; institution: string };

const TABLE = domains as Record<string, string>;

// Personal-mail providers get a dedicated error ("use your university
// address") instead of the generic unknown-domain one.
const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "live.com",
  "live.fr",
  "msn.com",
  "yahoo.com",
  "yahoo.fr",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "gmx.com",
  "gmx.net",
  "gmx.fr",
  "gmx.de",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "bluewin.ch",
  "sunrise.ch",
  "web.de",
  "t-online.de",
  "qq.com",
  "163.com",
  "126.com",
  "naver.com",
  "daum.net",
]);

// Pragmatic shape check (full RFC parsing is overkill here): one @, no
// whitespace, a dot somewhere in the domain part.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

// Walk the domain and its parents so "student.epfl.ch" matches "epfl.ch".
export function matchUniversityDomain(domain: string): UniversityMatch | null {
  let d = domain.toLowerCase();
  while (d.includes(".")) {
    const institution = TABLE[d];
    if (institution) return { domain: d, institution };
    d = d.slice(d.indexOf(".") + 1);
  }
  return null;
}

export type UniversityCheck =
  | { ok: true; email: string; match: UniversityMatch }
  | { ok: false; reason: "invalid" | "personal" | "unknown"; domain?: string };

export function checkUniversityEmail(raw: string): UniversityCheck {
  const email = normalizeEmail(raw);
  if (!isValidEmail(email)) return { ok: false, reason: "invalid" };
  const domain = emailDomain(email);
  if (FREE_MAIL.has(domain)) return { ok: false, reason: "personal", domain };
  const match = matchUniversityDomain(domain);
  if (!match) return { ok: false, reason: "unknown", domain };
  return { ok: true, email, match };
}
