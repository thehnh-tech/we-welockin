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
// picks, what each shape shows, and what a click, Escape, Deep Focus or a
// dismissal does to it.
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

const pill = () =>
  [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Too distracted?")
  ) ?? null;
const card = () => container.querySelector("aside");

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
    render({ variant: "sidebar" });
    const aside = card()!;
    expect(aside.getAttribute("lang")).toBe("de");
    expect(aside.getAttribute("aria-label")).toBe("welock.in App-Blocker");
    expect(aside.textContent).toContain("Schluss mit Scrollen");
    const cta = aside.querySelector("a")!;
    expect(cta.getAttribute("href")).toMatch(
      /^https:\/\/www\.welock\.in\/de\/download\?utm_/
    );
    expect(cta.getAttribute("hreflang")).toBe("de");
    expect(cta.getAttribute("rel")).toBe("noopener");
    expect(cta.getAttribute("target")).toBe("_blank");
  });

  it("follows a language change without a reload", () => {
    render({ variant: "banner" });
    expect(card()!.getAttribute("lang")).toBe("en");
    setLanguages(["fr"]);
    act(() => {
      window.dispatchEvent(new Event("languagechange"));
    });
    expect(card()!.getAttribute("lang")).toBe("fr");
    expect(card()!.textContent).toContain("Reliez tous vos appareils");
  });
});

describe("sidebar", () => {
  const figure = () => card()!.querySelector("figure")!;

  // A day whose count since the epoch is a multiple of seven, so the daily
  // start lands on the first review and the expectations below hold.
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-01-01T12:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the headline, three bullets, the CTA and the first review", () => {
    render({ variant: "sidebar" });
    const aside = card()!;
    expect(aside.textContent).toContain("Stop scrolling");
    expect(aside.querySelectorAll("ul > li")).toHaveLength(3);
    expect(aside.querySelector("a")!.getAttribute("href")).toMatch(
      /^https:\/\/www\.welock\.in\/download\?utm_.*utm_content=sidebar$/
    );
    expect(figure().textContent).toContain("Sarah Fourati");
    expect(figure().querySelector("img")!.getAttribute("src")).toBe(
      "/images/blocker/people/sarah-fourati.webp"
    );
    expect(
      aside.querySelectorAll('button[aria-label^="Show review"]')
    ).toHaveLength(7);
  });

  it("rotates every seven seconds, and a dot stops it on the review picked", () => {
    render({ variant: "sidebar" });
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(figure().textContent).toContain("Karim Assaf");
    click(card()!.querySelector('button[aria-label="Show review 5"]'));
    expect(figure().textContent).toContain("Selim Msallem");
    act(() => {
      vi.advanceTimersByTime(21000);
    });
    expect(figure().textContent).toContain("Selim Msallem");
  });

  it("never rotates under the app's reduced-motion setting", () => {
    document.documentElement.classList.add("wl-reduce");
    try {
      render({ variant: "sidebar" });
      act(() => {
        vi.advanceTimersByTime(14000);
      });
      expect(figure().textContent).toContain("Sarah Fourati");
    } finally {
      document.documentElement.classList.remove("wl-reduce");
    }
  });

  it("leads with the reader's own school, then schools in their language", () => {
    render({ variant: "sidebar", domain: "student.epfl.ch" });
    expect(figure().textContent).toContain("Selim Haouala");
    expect(figure().textContent).toContain("EPFL");

    act(() => root.unmount());
    root = createRoot(container);
    setLanguages(["de-AT"]);
    render({ variant: "sidebar" });
    expect(figure().textContent).toContain("Karim Assaf");
  });

  it("starts the day's review somewhere else the next day", () => {
    vi.setSystemTime(new Date("2026-01-02T12:00:00Z"));
    render({ variant: "sidebar" });
    expect(figure().textContent).toContain("Karim Assaf");
  });

  it("carries the reviews in the reader's language too", () => {
    setLanguages(["fr"]);
    render({ variant: "sidebar" });
    expect(figure().textContent).toContain("Master en Management");
    expect(figure().textContent).toContain("« Une appli qui change vraiment la vie");
  });
});

describe("bubble", () => {
  it("starts as a pill and opens into the card", () => {
    render({ variant: "bubble" });
    expect(pill()).not.toBeNull();
    expect(card()).toBeNull();
    click(pill());
    expect(pill()).toBeNull();
    expect(card()!.textContent).toContain("Link every device");
  });

  it("folds back on Escape and on the cross", () => {
    render({ variant: "bubble" });
    click(pill());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(card()).toBeNull();
    expect(pill()).not.toBeNull();

    click(pill());
    click(card()!.querySelector('button[aria-label="Close"]'));
    expect(card()).toBeNull();
    expect(pill()).not.toBeNull();
  });

  it("is folded by Deep Focus and restored only if it was open before", () => {
    render({ variant: "bubble", retracted: false });
    click(pill());
    render({ variant: "bubble", retracted: true });
    expect(card()).toBeNull();
    expect(pill()).not.toBeNull();
    render({ variant: "bubble", retracted: false });
    expect(card()).not.toBeNull();

    // Closed by hand before Deep Focus: stays closed after it.
    click(card()!.querySelector('button[aria-label="Close"]'));
    render({ variant: "bubble", retracted: true });
    render({ variant: "bubble", retracted: false });
    expect(card()).toBeNull();
    expect(pill()).not.toBeNull();
  });
});

describe("banner", () => {
  it("renders the bar with its spacer, landmark and localized links", () => {
    render({ variant: "banner" });
    const aside = card()!;
    expect(aside.getAttribute("aria-label")).toBe("welock.in app blocker");
    expect(aside.textContent).toContain("Five difficulty levels");
    const links = [...aside.querySelectorAll("a")].map((a) =>
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
  it("bubble: a short hop off the tab is not a distraction", () => {
    vi.useFakeTimers();
    try {
      render({ variant: "bubble", away: false });
      render({ variant: "bubble", away: true });
      act(() => {
        vi.advanceTimersByTime(20_000);
      });
      render({ variant: "bubble", away: false });
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(card()).toBeNull();
      expect(pill()).not.toBeNull();
      expect(sessionStorage.getItem("wlis_blocker_nudged_v1")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("bubble: opens by itself, once, a beat after a minute or more away", () => {
    vi.useFakeTimers();
    try {
      render({ variant: "bubble", away: false });
      render({ variant: "bubble", away: true });
      act(() => {
        vi.advanceTimersByTime(61_000);
      });
      render({ variant: "bubble", away: false });
      expect(card()).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1_200);
      });
      expect(card()).not.toBeNull();
      expect(card()!.querySelector("a")!.getAttribute("href")).toContain(
        "utm_content=bubble-return"
      );
      expect(sessionStorage.getItem("wlis_blocker_nudged_v1")).toBe("1");

      // Once per session: a second return does nothing.
      click(card()!.querySelector('button[aria-label="Close"]'));
      render({ variant: "bubble", away: true });
      act(() => {
        vi.advanceTimersByTime(61_000);
      });
      render({ variant: "bubble", away: false });
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(card()).toBeNull();
      expect(pill()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("bubble: not in Deep Focus", () => {
    // The nudge flag is set by now; this checks the fold itself wins.
    vi.useFakeTimers();
    try {
      render({ variant: "bubble", away: true, retracted: true });
      act(() => {
        vi.advanceTimersByTime(61_000);
      });
      render({ variant: "bubble", away: false, retracted: true });
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(card()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("bubble: Not now removes it for the session", () => {
    render({ variant: "bubble" });
    click(pill());
    click(
      [...card()!.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Not now")
      ) ?? null
    );
    expect(card()).toBeNull();
    expect(pill()).toBeNull();
    expect(sessionStorage.getItem("wlis_blocker_bubble_v1")).toBe("1");
    expect(localStorage.getItem("wlis_blocker_banner_v1")).toBeNull();
  });

  it("banner: the cross closes it for good", () => {
    render({ variant: "banner" });
    click(card()!.querySelector('button[aria-label="Close"]'));
    expect(card()).toBeNull();
    expect(container.querySelector('div[aria-hidden="true"]')).toBeNull();
    expect(localStorage.getItem("wlis_blocker_banner_v1")).toBe("1");
  });

  it("a CTA click quiets the bar and the bubble, and warms the site first", () => {
    // jsdom has no navigation; keep the click from trying.
    container.addEventListener("click", (e) => e.preventDefault());
    render({ variant: "sidebar" });
    const cta = card()!.querySelector("a")!;
    act(() => {
      (cta as HTMLElement).focus();
    });
    expect(
      document.head.querySelector(
        'link[rel="preconnect"][href="https://www.welock.in"]'
      )
    ).not.toBeNull();
    click(cta);
    expect(localStorage.getItem("wlis_blocker_quiet_v1")).toMatch(/^\d+$/);

    act(() => root.unmount());
    root = createRoot(container);
    render({ variant: "banner" });
    expect(card()).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    render({ variant: "bubble" });
    expect(pill()).toBeNull();
    // The sidebar is page furniture and stays.
    act(() => root.unmount());
    root = createRoot(container);
    render({ variant: "sidebar" });
    expect(card()).not.toBeNull();
  });
});
