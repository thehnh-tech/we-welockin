// @vitest-environment jsdom
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import BlockerBanner from "./BlockerBanner";

// Behaviour of the promo as rendered, without a browser: the language it
// picks, what the unit shows, and what a click, Deep Focus, a spell away or
// a dismissal does to it.
//
// jsdom answers no to every media query, so the rail is never "narrow" here
// and starts open — the collapsed cases below get there by hand or through
// Deep Focus, which is what a reader on a laptop would do.
//
// Dismissals are remembered at module level (on top of storage), so the
// tests that dismiss come last, in their own block.

let container: HTMLDivElement;
let root: Root;

function setLanguages(list: string[]) {
  Object.defineProperty(navigator, "languages", {
    configurable: true,
    get: () => list,
  });
}

function render(props: Parameters<typeof BlockerBanner>[0]) {
  act(() => {
    root.render(createElement(BlockerBanner, props));
  });
}

function click(el: Element | null) {
  if (!el) throw new Error("nothing to click");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const unit = () => container.querySelector("aside");
const rail = () => container.querySelector(".wl-promorail");
const collapsed = () => !!rail()?.classList.contains("wl-collapsed");
// The pill is a link to the site, not a control.
const pill = () =>
  [...container.querySelectorAll("a")].find((a) =>
    a.textContent?.includes("Too distracted?")
  ) ?? null;
const retractButton = () => unit()!.querySelector('button[aria-label="Close"]');
const cta = () => unit()!.querySelector("a")!;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

beforeEach(() => {
  setLanguages(["en-US"]);
  localStorage.clear();
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("language", () => {
  it("speaks the browser's language and links to that language's pages", () => {
    setLanguages(["de-CH", "en"]);
    render({ variant: "dock" });
    expect(unit()!.getAttribute("lang")).toBe("de");
    expect(unit()!.getAttribute("aria-label")).toBe("welock.in App-Blocker");
    expect(unit()!.textContent).toContain("Schluss mit Scrollen");
    expect(cta().getAttribute("href")).toMatch(
      /^https:\/\/www\.welock\.in\/de\/download\?utm_/
    );
    expect(cta().getAttribute("hreflang")).toBe("de");
    expect(cta().getAttribute("rel")).toBe("noopener");
    expect(cta().getAttribute("target")).toBe("_blank");
  });

  it("follows a language change without a reload", () => {
    render({ variant: "banner" });
    expect(unit()!.getAttribute("lang")).toBe("en");
    setLanguages(["fr"]);
    act(() => {
      window.dispatchEvent(new Event("languagechange"));
    });
    expect(unit()!.getAttribute("lang")).toBe("fr");
    expect(unit()!.textContent).toContain("Reliez tous vos appareils");
  });
});

describe("the unit", () => {
  const figure = () => unit()!.querySelector("figure")!;

  // A day whose count since the epoch is a multiple of seven, so the daily
  // start lands on the first review and the expectations below hold.
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-01-01T12:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the headline, three bullets, the CTA and the first review", () => {
    render({ variant: "dock" });
    expect(unit()!.textContent).toContain("Stop scrolling");
    expect(unit()!.querySelectorAll("ul > li")).toHaveLength(3);
    expect(cta().getAttribute("href")).toMatch(
      /^https:\/\/www\.welock\.in\/download\?utm_.*utm_content=dock$/
    );
    expect(figure().textContent).toContain("Sarah Fourati");
    expect(figure().querySelector("img")!.getAttribute("src")).toBe(
      "/images/blocker/people/sarah-fourati.webp"
    );
    expect(
      unit()!.querySelectorAll('button[aria-label^="Show review"]')
    ).toHaveLength(7);
  });

  it("rotates every seven seconds, and a dot stops it on the review picked", () => {
    render({ variant: "dock" });
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(figure().textContent).toContain("Karim Assaf");
    click(unit()!.querySelector('button[aria-label="Show review 5"]'));
    expect(figure().textContent).toContain("Selim Msallem");
    act(() => {
      vi.advanceTimersByTime(21000);
    });
    expect(figure().textContent).toContain("Selim Msallem");
  });

  it("never rotates under the app's reduced-motion setting", () => {
    document.documentElement.classList.add("wl-reduce");
    try {
      render({ variant: "dock" });
      act(() => {
        vi.advanceTimersByTime(14000);
      });
      expect(figure().textContent).toContain("Sarah Fourati");
    } finally {
      document.documentElement.classList.remove("wl-reduce");
    }
  });

  it("leads with the reader's own school, then schools in their language", () => {
    render({ variant: "dock", domain: "student.epfl.ch" });
    expect(figure().textContent).toContain("Selim Haouala");
    expect(figure().textContent).toContain("EPFL");

    act(() => root.unmount());
    root = createRoot(container);
    setLanguages(["de-AT"]);
    render({ variant: "dock" });
    expect(figure().textContent).toContain("Karim Assaf");
  });

  it("starts the day's review somewhere else the next day", () => {
    vi.setSystemTime(new Date("2026-01-02T12:00:00Z"));
    render({ variant: "dock" });
    expect(figure().textContent).toContain("Karim Assaf");
  });

  it("carries the reviews in the reader's language too", () => {
    setLanguages(["fr"]);
    render({ variant: "dock" });
    expect(figure().textContent).toContain("Master en Management");
    expect(figure().textContent).toContain(
      "« Une appli qui change vraiment la vie"
    );
  });
});

describe("the rail and its pill", () => {
  it("starts out, and the cross retracts it into the pill", () => {
    render({ variant: "dock" });
    expect(collapsed()).toBe(false);
    expect(pill()).toBeNull();

    click(retractButton());
    expect(collapsed()).toBe(true);
    expect(pill()).not.toBeNull();
    // The unit stays mounted behind the slide, out of the a11y tree.
    expect(rail()!.getAttribute("aria-hidden")).toBe("true");
  });

  it("folds into a pill that links to the site", () => {
    render({ variant: "dock" });
    click(retractButton());
    const link = pill()!;
    expect(link.getAttribute("href")).toBe(
      "https://www.welock.in/download?utm_source=welockin-study&utm_medium=referral&utm_campaign=blocker&utm_content=bubble"
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
    expect(link.getAttribute("hreflang")).toBe("en");
  });

  it("starts as a pill where the room is too narrow for it", () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes("1199"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    try {
      render({ variant: "dock" });
      expect(collapsed()).toBe(true);
      expect(pill()).not.toBeNull();
    } finally {
      window.matchMedia = real;
    }
  });

  it("is retracted by Deep Focus, down to its pill", () => {
    render({ variant: "dock", retracted: false });
    render({ variant: "dock", retracted: true });
    expect(collapsed()).toBe(true);
    // The pill stays: an emptied screen is exactly when someone reaches for
    // a blocker, and the pill is the way out to one.
    expect(pill()).not.toBeNull();
  });

  it("leaves Deep Focus as it found it", () => {
    render({ variant: "dock", retracted: false });
    render({ variant: "dock", retracted: true });
    render({ variant: "dock", retracted: false });
    expect(collapsed()).toBe(false);
    expect(pill()).toBeNull();
  });

  it("Not now folds it into the pill, the same as the cross", () => {
    render({ variant: "dock" });
    click(
      [...unit()!.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Not now")
      ) ?? null
    );
    expect(collapsed()).toBe(true);
    expect(pill()).not.toBeNull();
    // Nothing in a room takes the promo away outright.
    expect(sessionStorage.length).toBe(0);
  });

  it("leaving Deep Focus restores only what was there before", () => {
    render({ variant: "dock", retracted: false });
    render({ variant: "dock", retracted: true });
    render({ variant: "dock", retracted: false });
    expect(collapsed()).toBe(false);

    // Retracted by hand before Deep Focus: stays a pill after it.
    click(retractButton());
    render({ variant: "dock", retracted: true });
    render({ variant: "dock", retracted: false });
    expect(collapsed()).toBe(true);
    expect(pill()).not.toBeNull();
  });
});

describe("banner", () => {
  it("renders the bar with its spacer, landmark and localized links", () => {
    render({ variant: "banner" });
    expect(unit()!.getAttribute("aria-label")).toBe("welock.in app blocker");
    expect(unit()!.textContent).toContain("Five difficulty levels");
    const links = [...unit()!.querySelectorAll("a")].map((a) =>
      a.getAttribute("href")
    );
    expect(links[0]).toMatch(/^https:\/\/www\.welock\.in\/\?utm_/);
    expect(links[1]).toMatch(/^https:\/\/www\.welock\.in\/download\?utm_/);
    // The in-flow spacer that keeps page content clear of the fixed bar.
    expect(container.querySelector('div[aria-hidden="true"]')).not.toBeNull();
  });
});

// Dismissals and nudges last: they are remembered for the rest of the
// module's life, in the order below.
describe("dismissals", () => {
  it("a short hop off the tab is not a distraction", () => {
    vi.useFakeTimers();
    try {
      render({ variant: "dock" });
      click(retractButton());
      render({ variant: "dock", away: true });
      act(() => {
        vi.advanceTimersByTime(20_000);
      });
      render({ variant: "dock", away: false });
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(collapsed()).toBe(true);
      expect(sessionStorage.getItem("wlis_blocker_nudged_v1")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a retracted rail comes out by itself, once, after a minute away", () => {
    vi.useFakeTimers();
    try {
      render({ variant: "dock" });
      click(retractButton());
      render({ variant: "dock", away: true });
      act(() => {
        vi.advanceTimersByTime(61_000);
      });
      render({ variant: "dock", away: false });
      expect(collapsed()).toBe(true);
      act(() => {
        vi.advanceTimersByTime(1_200);
      });
      expect(collapsed()).toBe(false);
      expect(cta().getAttribute("href")).toContain("utm_content=dock-return");
      expect(sessionStorage.getItem("wlis_blocker_nudged_v1")).toBe("1");

      // Once per session: a second return leaves it alone.
      click(retractButton());
      render({ variant: "dock", away: true });
      act(() => {
        vi.advanceTimersByTime(61_000);
      });
      render({ variant: "dock", away: false });
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(collapsed()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("banner: the cross closes it for good", () => {
    render({ variant: "banner" });
    click(unit()!.querySelector('button[aria-label="Close"]'));
    expect(unit()).toBeNull();
    expect(container.querySelector('div[aria-hidden="true"]')).toBeNull();
    expect(localStorage.getItem("wlis_blocker_banner_v1")).toBe("1");
  });

  it("warms the site on intent, and stays put once followed", async () => {
    // A fresh copy of the module: the banner above was closed in its own
    // memory as well as in storage.
    vi.resetModules();
    const Fresh = (await import("./BlockerBanner")).default;
    const render = (props: Parameters<typeof BlockerBanner>[0]) =>
      act(() => {
        root.render(createElement(Fresh, props));
      });
    // jsdom has no navigation; keep the click from trying.
    container.addEventListener("click", (e) => e.preventDefault());
    render({ variant: "dock" });
    act(() => {
      (cta() as HTMLElement).focus();
    });
    expect(
      document.head.querySelector(
        'link[rel="preconnect"][href="https://www.welock.in"]'
      )
    ).not.toBeNull();

    // The link opens a tab of its own; nothing here is taken down for it.
    click(cta());
    expect(unit()).not.toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    act(() => root.unmount());
    root = createRoot(container);
    render({ variant: "banner" });
    expect(unit()).not.toBeNull();
  });
});
