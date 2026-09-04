import { describe, expect, it } from "vitest";
import {
  BLOCKER_LOCALES,
  BLOCKER_ORIGIN,
  BLOCKER_SIDEBAR,
  BLOCKER_STRINGS,
  blockerUrl,
  orderReviews,
  pickBlockerLocale,
} from "./blocker";
import { BLOCKER_REVIEWS } from "./blockerReviews";

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
    expect(blockerUrl("de", "download", "dock", origin)).toMatch(
      new RegExp(`^${origin}/de/download\\?`)
    );
    expect(blockerUrl("en", "download", "dock", origin)).toMatch(
      new RegExp(`^${origin}/download\\?`)
    );
  });

  it("tags each placement so analytics can tell them apart", () => {
    const content = (u: string) => new URL(u).searchParams.get("utm_content");
    expect(content(blockerUrl("en", "home", "dock", origin))).toBe("dock");
    expect(content(blockerUrl("en", "home", "dock-return", origin))).toBe(
      "dock-return"
    );
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
    }
  });
});

describe("orderReviews", () => {
  const who = (xs: readonly { who: string }[]) => xs.map((r) => r.who);

  it("leads with the reader's own school, by verified domain or a subdomain", () => {
    expect(who(orderReviews(BLOCKER_REVIEWS, "en", "student.epfl.ch", 0))[0]).toBe(
      "Selim Haouala"
    );
    expect(who(orderReviews(BLOCKER_REVIEWS, "en", "ETHZ.CH", 5))[0]).toBe(
      "Karim Assaf"
    );
    // A look-alike domain is not a match.
    expect(who(orderReviews(BLOCKER_REVIEWS, "en", "notepfl.ch", 0))[0]).toBe(
      "Sarah Fourati"
    );
  });

  it("then schools that live in the reader's language", () => {
    expect(who(orderReviews(BLOCKER_REVIEWS, "de", "", 0))[0]).toBe("Karim Assaf");
    // Every school but ETH is francophone, so for French readers ETH is last.
    const fr = who(orderReviews(BLOCKER_REVIEWS, "fr", "", 0));
    expect(fr[fr.length - 1]).toBe("Karim Assaf");
  });

  it("starts the leading group somewhere else each day, keeping the set", () => {
    const a = who(orderReviews(BLOCKER_REVIEWS, "en", "", 0));
    const b = who(orderReviews(BLOCKER_REVIEWS, "en", "", 1));
    expect(a[0]).toBe("Sarah Fourati");
    expect(b[0]).toBe("Karim Assaf");
    expect([...a].sort()).toEqual([...b].sort());
    expect(who(orderReviews(BLOCKER_REVIEWS, "en", "", 7))).toEqual(a);
    expect(who(orderReviews(BLOCKER_REVIEWS, "en", "", -1))[0]).toBe(
      "Omar Bouzguenda"
    );
  });

  it("never lets the day move the reader's own school off the top", () => {
    for (const day of [0, 3, 6]) {
      expect(who(orderReviews(BLOCKER_REVIEWS, "fr", "hec.fr", day))[0]).toBe(
        "Sarah Fourati"
      );
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
