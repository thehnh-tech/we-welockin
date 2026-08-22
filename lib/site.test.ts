import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SITE_URL is resolved at module load, so each case re-imports the module
// with a fresh environment.
async function loadSiteUrl(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (await import("./site")).SITE_URL;
}

const KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
});

describe("SITE_URL", () => {
  it("prefers the explicit override and drops a trailing slash", async () => {
    expect(
      await loadSiteUrl({
        NEXT_PUBLIC_SITE_URL: "https://study.welock.in/",
        VERCEL_PROJECT_PRODUCTION_URL: "welockinstudy.vercel.app",
      })
    ).toBe("https://study.welock.in");
  });

  it("falls back to the Vercel production domain, not a hard-coded one", async () => {
    // The bug this guards: a hard-coded default pointed canonical/og:image at
    // a domain the app does not serve, handing its pages to another site.
    expect(
      await loadSiteUrl({
        NEXT_PUBLIC_SITE_URL: undefined,
        VERCEL_PROJECT_PRODUCTION_URL: "welockinstudy.vercel.app",
      })
    ).toBe("https://welockinstudy.vercel.app");
  });

  it("falls back to localhost off-platform", async () => {
    expect(
      await loadSiteUrl({
        NEXT_PUBLIC_SITE_URL: undefined,
        VERCEL_PROJECT_PRODUCTION_URL: undefined,
      })
    ).toBe("http://localhost:3000");
  });
});
