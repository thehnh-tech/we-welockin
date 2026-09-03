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
    vi.useFakeTimers();
    try {
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
    } finally {
      vi.useRealTimers();
    }
  });

  it("never rotates under the app's reduced-motion setting", () => {
    vi.useFakeTimers();
    document.documentElement.classList.add("wl-reduce");
    try {
      render({ variant: "sidebar" });
      act(() => {
        vi.advanceTimersByTime(14000);
      });
      expect(figure().textContent).toContain("Sarah Fourati");
    } finally {
      document.documentElement.classList.remove("wl-reduce");
      vi.useRealTimers();
    }
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

// Dismissals last: they are remembered for the rest of the module's life.
describe("dismissals", () => {
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
});
