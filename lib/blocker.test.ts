import { describe, expect, it } from "vitest";
import {
  BLOCKER_LOCALES,
  BLOCKER_ORIGIN,
  BLOCKER_SIDEBAR,
  BLOCKER_STRINGS,
  blockerUrl,
  pickBlockerLocale,
} from "./blocker";

describe("pickBlockerLocale", () => {
  it("matches the exact tag the site publishes, whatever the case", () => {
    expect(pickBlockerLocale(["pt-BR"])).toBe("pt-BR");
    expect(pickBlockerLocale(["PT-br"])).toBe("pt-BR");
    expect(pickBlockerLocale(["FR"])).toBe("fr");
  });

  it("falls back to the language family: Swiss French gets French", () => {
    expect(pickBlockerLocale(["fr-CH"])).toBe("fr");
    expect(pickBlockerLocale(["de-AT"])).toBe("de");
    expect(pickBlockerLocale(["es-MX"])).toBe("es");
    expect(pickBlockerLocale(["en-GB"])).toBe("en");
  });

  it("maps every Portuguese to the one Portuguese the site has", () => {
    expect(pickBlockerLocale(["pt"])).toBe("pt-BR");
    expect(pickBlockerLocale(["pt-PT"])).toBe("pt-BR");
  });

  it("respects the browser's preference order", () => {
    // A bilingual browser that prefers English stays English.
    expect(pickBlockerLocale(["en-US", "fr"])).toBe("en");
    // A language the site lacks is skipped for the next preference.
    expect(pickBlockerLocale(["ja", "de"])).toBe("de");
  });

  it("defaults to English, the site's x-default", () => {
    expect(pickBlockerLocale([])).toBe("en");
    expect(pickBlockerLocale(["ja"])).toBe("en");
    expect(pickBlockerLocale(["", "  "])).toBe("en");
  });
});

describe("blockerUrl", () => {
  const origin = "https://staging.example";

  it("lands English on the root and the other languages on their path", () => {
    expect(blockerUrl("en", "home", "banner", origin)).toBe(
      `${origin}/?utm_source=welockin-study&utm_medium=referral&utm_campaign=blocker&utm_content=banner`
    );
    expect(blockerUrl("fr", "home", "banner", origin)).toMatch(
      new RegExp(`^${origin}/fr\\?`)
    );
    expect(blockerUrl("pt-BR", "home", "banner", origin)).toMatch(
      new RegExp(`^${origin}/pt-br\\?`)
    );
  });

  it("sends the download CTA to the localized download page", () => {
    expect(blockerUrl("de", "download", "bubble", origin)).toMatch(
      new RegExp(`^${origin}/de/download\\?`)
    );
    expect(blockerUrl("en", "download", "sidebar", origin)).toMatch(
      new RegExp(`^${origin}/download\\?`)
    );
  });

  it("tags each placement so analytics can tell them apart", () => {
    const content = (u: string) => new URL(u).searchParams.get("utm_content");
    expect(content(blockerUrl("en", "home", "bubble", origin))).toBe("bubble");
    expect(content(blockerUrl("en", "home", "sidebar", origin))).toBe("sidebar");
  });

  it("defaults to welock.in's canonical host (www, https, no trailing slash)", () => {
    expect(BLOCKER_ORIGIN).toBe("https://www.welock.in");
    expect(blockerUrl("es", "home", "banner")).toBe(
      "https://www.welock.in/es?utm_source=welockin-study&utm_medium=referral&utm_campaign=blocker&utm_content=banner"
    );
  });
});

describe("BLOCKER_STRINGS", () => {
  it("has complete, non-empty copy for every language the site publishes", () => {
    for (const locale of BLOCKER_LOCALES) {
      const t = BLOCKER_STRINGS[locale];
      for (const [key, value] of Object.entries(t)) {
        const values = Array.isArray(value) ? value : [value];
        for (const v of values) {
          expect(v, `${locale}.${key}`).toBeTypeOf("string");
          expect(v.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
        }
      }
      expect(t.bullets).toHaveLength(2);
    }
  });

  it("keeps the platform names untranslated", () => {
    for (const locale of BLOCKER_LOCALES) {
      const devices = BLOCKER_STRINGS[locale].bullets[1];
      for (const name of ["Mac", "PC", "iPhone", "iPad"]) {
        expect(devices, locale).toContain(name);
      }
    }
  });
});

describe("BLOCKER_SIDEBAR", () => {
  it("has the full unit in every language, with a numbered dot label", () => {
    for (const locale of BLOCKER_LOCALES) {
      const s = BLOCKER_SIDEBAR[locale];
      expect(s.headline, locale).toHaveLength(3);
      expect(s.bullets, locale).toHaveLength(3);
      for (const v of [...s.headline, ...s.bullets, s.cta, s.showReview]) {
        expect(v.trim().length, locale).toBeGreaterThan(0);
      }
      expect(s.showReview, locale).toContain("{n}");
    }
  });
});
