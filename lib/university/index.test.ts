import { describe, expect, it } from "vitest";
import domains from "./domains.json";
import {
  checkUniversityEmail,
  emailDomain,
  isValidEmail,
  matchUniversityDomain,
  normalizeEmail,
} from "./index";

describe("normalizeEmail / isValidEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Hedi.Fourati@EPFL.CH ")).toBe(
      "hedi.fourati@epfl.ch"
    );
  });

  it("accepts plausible addresses and rejects junk", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.uni.edu")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("two@@at.com")).toBe(false);
    expect(isValidEmail("spaces in@it.com")).toBe(false);
    expect(isValidEmail("no-tld@host")).toBe(false);
    expect(isValidEmail(`${"x".repeat(250)}@uni.edu`)).toBe(false);
  });
});

describe("emailDomain", () => {
  it("takes everything after the last @", () => {
    expect(emailDomain("a@epfl.ch")).toBe("epfl.ch");
    expect(emailDomain("weird@quoted@epfl.ch")).toBe("epfl.ch");
  });
});

describe("matchUniversityDomain", () => {
  it("matches a known domain exactly", () => {
    const m = matchUniversityDomain("epfl.ch");
    expect(m?.domain).toBe("epfl.ch");
    expect(m?.institution).toMatch(/Lausanne/);
  });

  it("walks subdomains up to a known parent", () => {
    const m = matchUniversityDomain("student.epfl.ch");
    expect(m?.domain).toBe("epfl.ch");
  });

  it("is case-insensitive", () => {
    expect(matchUniversityDomain("EPFL.CH")?.domain).toBe("epfl.ch");
  });

  it("returns null for unknown domains", () => {
    expect(matchUniversityDomain("definitely-not-a-university.xyz")).toBeNull();
  });

  it("never matches a bare TLD", () => {
    expect(matchUniversityDomain("ch")).toBeNull();
  });
});

describe("dataset integrity", () => {
  it("carries decoded institution names, not HTML entities", () => {
    // The upstream TOML escapes names ("Science &amp; Technology"); every
    // consumer renders them as text, so the entities must be decoded at build
    // time or they show up literally on screen and in emails.
    const names = Object.values(domains as Record<string, string>);
    const escaped = names.filter((n) => /&(amp|lt|gt|quot|apos|#\d+);/.test(n));
    expect(escaped).toEqual([]);
    expect((domains as Record<string, string>)["aast.edu"]).toContain("&");
  });

  it("keys domains by their own name, so none are lost to bad upstream rows", () => {
    // mmu.ac.ke's file carries another school's sld/tld upstream; keying on
    // that dropped the domain entirely.
    expect(matchUniversityDomain("mmu.ac.ke")).not.toBeNull();
  });
});

describe("checkUniversityEmail", () => {
  it("accepts a university address and returns the match", () => {
    const r = checkUniversityEmail(" Someone@Student.EPFL.ch ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.email).toBe("someone@student.epfl.ch");
      expect(r.match.domain).toBe("epfl.ch");
    }
  });

  it("rejects malformed input as invalid", () => {
    const r = checkUniversityEmail("nope");
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("flags personal providers distinctly", () => {
    const r = checkUniversityEmail("someone@gmail.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("personal");
  });

  it("flags unknown domains with the domain for the request-CTA", () => {
    const r = checkUniversityEmail("someone@small-school.example");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unknown");
      expect(r.domain).toBe("small-school.example");
    }
  });
});
