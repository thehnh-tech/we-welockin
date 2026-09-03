import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCKER_LOCALES } from "./blocker";
import { BLOCKER_REVIEWS } from "./blockerReviews";

describe("BLOCKER_REVIEWS", () => {
  it("carries the seven reviews, each complete in every language", () => {
    expect(BLOCKER_REVIEWS).toHaveLength(7);
    const names = new Set(BLOCKER_REVIEWS.map((r) => r.who));
    expect(names.size).toBe(7);
    for (const r of BLOCKER_REVIEWS) {
      expect(r.where.trim().length, r.who).toBeGreaterThan(0);
      for (const locale of BLOCKER_LOCALES) {
        expect(r.text[locale].trim().length, `${r.who} ${locale}`).toBeGreaterThan(20);
        expect(r.role[locale].trim().length, `${r.who} ${locale}`).toBeGreaterThan(0);
      }
    }
  });

  it("points at photos and logos that ship with the app", () => {
    // A path that 404s renders a broken image with no warning anywhere else.
    for (const r of BLOCKER_REVIEWS) {
      for (const p of [r.photo, r.logo]) {
        expect(p, r.who).toMatch(/^\/images\/blocker\//);
        expect(existsSync(join(process.cwd(), "public", p)), p).toBe(true);
      }
    }
  });
});
