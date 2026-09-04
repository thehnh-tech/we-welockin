"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  BLOCKER_ORIGIN,
  BLOCKER_QUIET_AFTER_CLICK_MS,
  BLOCKER_RETURN_NUDGE_MS,
  BLOCKER_SIDEBAR,
  BLOCKER_STRINGS,
  blockerUrl,
  orderReviews,
  pickBlockerLocale,
  type BlockerLocale,
  type BlockerPlacement,
  type BlockerStrings,
} from "@/lib/blocker";
import { BLOCKER_REVIEWS } from "@/lib/blockerReviews";

// The welock.in blocker promo, in the shapes of the v2 ad kit.
//
// Two placements, three shapes. On the home page, the cream bar along the
// bottom. In a room, the sidebar unit — headline, bullets, CTA and the
// site's seven student reviews rotating underneath — in a rail down the
// right of the room, which retracts into the bubble: a pill in the corner
// that expands the rail again.
//
// It is the brand's world, not the app's: cream paper, ink and welock.in red
// whatever theme the app is in — the same line the ink band draws, in the
// other direction. Copy comes from lib/blocker, in the browser's language.
//
// Search-friendly by construction: real text in an <aside> landmark tagged
// with its language; links that land on welock.in's canonical host, on the
// page in that language, and say so (hreflang); an inline SVG mark (no
// request, no layout shift); and everything server-rendered in English so
// the markup is in the HTML before hydration — the language, the collapse
// and any dismissal apply right after, through useSyncExternalStore, never
// as a mismatch. The links keep their referrer (rel is noopener only): the
// referral is the point.
//
// And a few things it knows. It goes quiet for a fortnight once a CTA has
// been clicked. The unit leads with the reader's own school — their verified
// email domain — or with schools in their language. A retracted rail opens
// by itself, once, when someone comes back after a minute or more off the
// tab: the moment the pill's own words apply. And the site's connection is
// warmed the moment a CTA is hovered or focused.

/* -------------------------------------------------------------------------
   Browser state — language, width, and what has already been said
------------------------------------------------------------------------- */

function subscribeLanguage(onChange: () => void) {
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}
function readLocale(): BlockerLocale {
  const list = navigator.languages;
  return pickBlockerLocale(list && list.length ? list : [navigator.language]);
}
function useBlockerLocale(): BlockerLocale {
  return useSyncExternalStore(subscribeLanguage, readLocale, () => "en");
}

// Below this, the rail would leave the video tiles too little room, so it
// starts retracted — still openable by hand from the pill.
const NARROW = "(max-width: 1199px)";

// Mirrored into state after mount rather than read through
// useSyncExternalStore: the server has no viewport, so its snapshot has to
// be a guess, and the client answer must win as soon as there is one.
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW);
    if (!mq) return;
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

// The banner closes for good and a CTA click quiets the promo for a
// fortnight (localStorage); the rail's "Not now" and its return nudge last
// the session (sessionStorage). Without storage, each still holds for the
// life of the page.
const BANNER_KEY = "wlis_blocker_banner_v1";
const DOCK_KEY = "wlis_blocker_dock_v1";
const QUIET_KEY = "wlis_blocker_quiet_v1";
const NUDGED_KEY = "wlis_blocker_nudged_v1";

const remembered = new Map<string, string>();
const listeners = new Set<() => void>();
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
function storageFor(key: string): Storage {
  return key === BANNER_KEY || key === QUIET_KEY
    ? localStorage
    : sessionStorage;
}
function read(key: string): string | null {
  const local = remembered.get(key);
  if (local !== undefined) return local;
  try {
    return storageFor(key).getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  remembered.set(key, value);
  try {
    storageFor(key).setItem(key, value);
  } catch {}
  listeners.forEach((l) => l());
}
function isQuiet(): boolean {
  const since = Number(read(QUIET_KEY));
  return since > 0 && Date.now() - since < BLOCKER_QUIET_AFTER_CLICK_MS;
}
// Gone: dismissed, or quiet after a click.
function useGone(key: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(key) === "1" || isQuiet(),
    () => false
  );
}

// Every CTA opens another site. Warm its connection the moment intent shows
// (hover or focus), once — the landing page then starts a round-trip ahead
// of the click — and note the click, which quiets the promo.
let warmed = false;
function warmUp() {
  if (warmed) return;
  warmed = true;
  try {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = BLOCKER_ORIGIN;
    document.head.appendChild(link);
  } catch {}
}
function noteClick() {
  remember(QUIET_KEY, String(Date.now()));
}
const CTA = { onPointerEnter: warmUp, onFocus: warmUp, onClick: noteClick };

// Days since the epoch: the unit's daily start. Read as browser state so the
// server's copy, which has no reader, simply starts at the top.
const never = () => () => {};
function today(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/* -------------------------------------------------------------------------
   Glyphs
------------------------------------------------------------------------- */

// The brand mark — the fez peeking over the wall, from app/icon.svg minus
// its tile. Decorative: the wordmark beside it carries the name.
function Mark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      aria-hidden="true"
      className="block shrink-0"
    >
      <path
        d="M30 57 L40 14 Q41.5 8 48 8 L85 5 Q91.5 4.6 93 11 L102 53 Q86 61 66 61 Q44 61 30 57 Z"
        fill="#d3271c"
        stroke="#191410"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M88 8 C97 15 99.5 28 100 43"
        fill="none"
        stroke="#191410"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <ellipse
        cx="97.6"
        cy="22"
        rx="4.6"
        ry="6"
        fill="#191410"
        transform="rotate(-8 97.6 22)"
      />
      <ellipse
        cx="99.6"
        cy="34"
        rx="4.6"
        ry="6"
        fill="#191410"
        transform="rotate(-4 99.6 34)"
      />
      <path
        d="M100 43 L110 56 M100 44 L104 58 M99 44 L97 58"
        fill="none"
        stroke="#191410"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M34 59 Q29 76 31 92"
        fill="none"
        stroke="#191410"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M97 57 Q102 75 100 92"
        fill="none"
        stroke="#191410"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M44 68 Q52 62 59 67"
        fill="none"
        stroke="#191410"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M71 67 Q78 62 86 68"
        fill="none"
        stroke="#191410"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <ellipse cx="52" cy="81" rx="4.5" ry="7" fill="#191410" />
      <ellipse cx="78" cy="81" rx="4.5" ry="7" fill="#191410" />
      <path
        d="M16 94 A 9.5 9.5 0 0 1 35 94"
        fill="#f6ecdf"
        stroke="#191410"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M93 94 A 9.5 9.5 0 0 1 112 94"
        fill="#f6ecdf"
        stroke="#191410"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M8 94 L120 94"
        fill="none"
        stroke="#191410"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Real text, not an image: it reads, copies and indexes as the name it is.
function Wordmark({ size }: { size: number }) {
  return (
    <span
      className="whitespace-nowrap font-bold leading-none text-[#1a1714]"
      style={{ fontSize: size, letterSpacing: "-0.03em" }}
    >
      welock<span className="text-[#c8402f]">.in</span>
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="transition-transform duration-200 ease-wl group-hover:translate-x-[2px]"
    >
      <path d="M5 12h13M12 5l7 7-7 7" />
    </svg>
  );
}

function CrossIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/* -------------------------------------------------------------------------
   The unit — headline, bullets, CTA, and the reviews underneath
------------------------------------------------------------------------- */

const ROTATE_MS = 7000;

function Unit({
  locale,
  t,
  domain,
  placement,
  onRetract,
  onDismiss,
}: {
  locale: BlockerLocale;
  t: BlockerStrings;
  domain: string;
  placement: BlockerPlacement;
  /** Fold the unit back into the pill. */
  onRetract: () => void;
  /** Send it away for the session. */
  onDismiss: () => void;
}) {
  const s = BLOCKER_SIDEBAR[locale];
  // The reader's own school first, then schools in their language, the
  // leading group starting somewhere else each day (orderReviews).
  const day = useSyncExternalStore(never, today, () => 0);
  const reviews = useMemo(
    () => orderReviews(BLOCKER_REVIEWS, locale, domain, day),
    [locale, domain, day]
  );
  const [index, setIndex] = useState(0);
  // The reviews rotate until the reader shows any interest in them —
  // hovering, focusing, or picking one by hand.
  const [rotating, setRotating] = useState(true);
  const stop = () => setRotating(false);

  useEffect(() => {
    if (!rotating) return;
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ||
      document.documentElement.classList.contains("wl-reduce");
    if (reduced) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % BLOCKER_REVIEWS.length),
      ROTATE_MS
    );
    return () => window.clearInterval(id);
  }, [rotating]);

  const review = reviews[index % reviews.length];

  return (
    <aside
      lang={locale}
      aria-label={t.label}
      onMouseEnter={stop}
      onFocus={stop}
      className="rounded-[18px] border border-[rgba(26,23,20,.09)] bg-[#fbf8f2] px-[22px] pb-[22px] pt-4 text-[#1a1714] shadow-[0_10px_28px_rgba(26,23,20,.07)]"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <Mark size={26} />
        <Wordmark size={15} />
        <button
          type="button"
          onClick={onRetract}
          aria-label={t.close}
          className="ml-auto flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[rgba(26,23,20,.06)] text-[#7a7164] transition-colors duration-150 hover:bg-[rgba(26,23,20,.14)] hover:text-[#1a1714]"
        >
          <CrossIcon size={13} />
        </button>
      </div>

      <p className="mb-4 text-[29px] font-bold leading-[1.14] tracking-[-0.028em]">
        {s.headline[0]}
        <span className="rounded-[3px] bg-[#f0d4ca] px-[5px] py-px">
          {s.headline[1]}
        </span>
        {s.headline[2]}
      </p>

      <ul className="mb-4 flex flex-col gap-3">
        {s.bullets.map((b) => (
          <li
            key={b}
            className="grid grid-cols-[auto_1fr] items-start gap-[11px] text-[15.5px] leading-[1.42]"
          >
            <span
              aria-hidden="true"
              className="mt-2 h-1.5 w-1.5 rounded-full bg-[#c8402f]"
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <a
        href={blockerUrl(locale, "download", placement)}
        hrefLang={locale}
        target="_blank"
        rel="noopener"
        {...CTA}
        className="flex h-[54px] items-center justify-center rounded-full border-[1.5px] border-[#1a1714] bg-[#f0d4ca] text-[16px] font-bold tracking-[-0.012em] text-[#1a1714] no-underline transition-colors duration-200 hover:bg-[#1a1714] hover:text-[#fbf8f2]"
      >
        {s.cta}
      </a>

      <button
        type="button"
        onClick={onDismiss}
        className="mt-2.5 block w-full py-1.5 text-[13px] font-medium text-[#8a8175] transition-colors duration-150 hover:text-[#1a1714]"
      >
        {t.notNow}
      </button>

      <div className="mt-3 border-t border-[rgba(26,23,20,.11)] pt-4">
        {/* Keyed on the person so a change re-runs the fade-in. min-height,
            not height: a long translation grows the unit rather than
            spilling out of it. */}
        <figure
          key={review.who}
          className="flex min-h-[236px] flex-col justify-between animate-wl-rise"
        >
          <blockquote>
            <p
              className="text-[17px] leading-[1.38] tracking-[-0.005em]"
              style={{ fontFamily: "var(--font-garamond), Georgia, serif" }}
            >
              {review.text[locale]}
            </p>
          </blockquote>
          <figcaption className="flex items-center gap-[11px] pt-3.5">
            {/* Tiny, lazy and sized: nothing for next/image to improve. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={review.photo}
              alt=""
              width={34}
              height={34}
              loading="lazy"
              decoding="async"
              className="h-[34px] w-[34px] shrink-0 rounded-full border border-[rgba(26,23,20,.08)] bg-[#f0ece4] object-cover"
            />
            <span className="flex min-w-0 flex-1 flex-col leading-[1.25]">
              <span className="text-[13.5px] font-bold tracking-[-0.01em]">
                {review.who}
              </span>
              <span className="text-[12px] leading-[1.3] text-[#7a7164]">
                {review.role[locale]} · {review.where}
              </span>
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={review.logo}
              alt={review.where}
              width={44}
              height={22}
              loading="lazy"
              decoding="async"
              className="h-[22px] w-[44px] shrink-0 object-contain"
            />
          </figcaption>
        </figure>

        <div className="-ml-1.5 mt-2 flex gap-0.5">
          {reviews.map((r, n) => (
            <button
              key={r.who}
              type="button"
              aria-label={s.showReview.replace("{n}", String(n + 1))}
              aria-pressed={n === index}
              onClick={() => {
                stop();
                setIndex(n);
              }}
              className="flex h-5 w-5 items-center justify-center"
            >
              <span
                className={`h-[7px] w-[7px] rounded-full ${
                  n === index ? "bg-[#1a1714]" : "bg-[rgba(26,23,20,.2)]"
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------
   Placements
------------------------------------------------------------------------- */

type Variant = "banner" | "dock";

// In a room: the unit in a rail down the right of the room column, and the
// bubble it retracts into — a pill in the bottom-right corner that brings
// the rail back. The rail slides out on margin-right, the way the crew
// sidebar slides out on the other side, so the tiles reflow rather than
// being covered; Deep Focus retracts it, which is the whole point of Deep
// Focus, and leaving Deep Focus returns it to whatever it was before.
function Dock({
  locale,
  t,
  domain,
  retracted,
  away,
}: {
  locale: BlockerLocale;
  t: BlockerStrings;
  domain: string;
  retracted: boolean;
  away: boolean;
}) {
  const gone = useGone(DOCK_KEY);
  const narrow = useNarrow();
  // "auto" follows the width; a click pins it either way for the session.
  const [pinned, setPinned] = useState<"auto" | "open" | "shut">("auto");
  // Opened by the return nudge, so that click can be told from a tap on the
  // pill. Cleared as soon as the reader works the rail by hand.
  const [returned, setReturned] = useState(false);
  const collapsed =
    retracted || pinned === "shut" || (pinned === "auto" && narrow);

  // The return nudge. Someone who left the tab for a minute or more and came
  // back was, most likely, distracted — the one moment the pill's own words
  // apply. A beat after they return the rail opens on its own: once per
  // session, only from retracted, never in Deep Focus, never once it has
  // been sent away.
  const awaySince = useRef<number | null>(null);
  useEffect(() => {
    if (away) {
      awaySince.current = Date.now();
      return;
    }
    const since = awaySince.current;
    awaySince.current = null;
    if (since === null || Date.now() - since < BLOCKER_RETURN_NUDGE_MS) return;
    if (!collapsed || retracted || gone || read(NUDGED_KEY) === "1") return;
    const id = window.setTimeout(() => {
      remember(NUDGED_KEY, "1");
      setReturned(true);
      setPinned("open");
    }, 1200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [away]);

  if (gone) return null;

  return (
    <>
      <div
        className={`wl-promorail border-l border-hairline ${
          collapsed ? "wl-collapsed" : ""
        }`}
        aria-hidden={collapsed || undefined}
      >
        <div className="wl-promoinner">
          <Unit
            locale={locale}
            t={t}
            domain={domain}
            placement={returned ? "dock-return" : "dock"}
            onRetract={() => {
              setReturned(false);
              setPinned("shut");
            }}
            onDismiss={() => remember(DOCK_KEY, "1")}
          />
        </div>
      </div>

      {collapsed && !retracted && (
        <button
          type="button"
          onClick={() => {
            setReturned(false);
            setPinned("open");
          }}
          aria-expanded={false}
          className="absolute bottom-4 right-4 z-30 flex h-14 items-center gap-3 rounded-full border border-[rgba(26,23,20,.08)] bg-[#fbf8f2] pl-[9px] pr-[22px] text-left shadow-[0_16px_34px_rgba(26,23,20,.2)] transition-[box-shadow,background-color] duration-200 hover:bg-white hover:shadow-[0_20px_42px_rgba(26,23,20,.28)] animate-wl-rise"
        >
          <Mark size={38} />
          <span lang={locale} className="flex flex-col items-start leading-[1.22]">
            <span className="text-[15px] font-bold tracking-[-0.015em] text-[#1a1714]">
              {t.pillTitle}
            </span>
            <span className="text-[12.5px] text-[#7a7164]">{t.pillSub}</span>
          </span>
        </button>
      )}
    </>
  );
}

// Home: the cream bar pinned to the bottom of the viewport. Slides up on
// load, closes for good on the cross. The in-flow spacer keeps the page's
// last content scrollable clear of it (the bar is fixed, so it takes no
// space of its own). On a phone the CTA drops to its own row under the
// copy: side by side, the headline would wrap four deep beside it.
function Banner({
  locale,
  t,
  className = "",
}: {
  locale: BlockerLocale;
  t: BlockerStrings;
  className?: string;
}) {
  const gone = useGone(BANNER_KEY);
  if (gone) return null;
  return (
    <>
      <div aria-hidden="true" className="h-24" />
      <aside
        lang={locale}
        aria-label={t.label}
        className={`fixed inset-x-0 bottom-0 z-30 flex items-center gap-4 border-t border-[rgba(26,23,20,.13)] bg-[#f5f0e8] px-4 py-3.5 text-[#1a1714] shadow-[0_-14px_38px_rgba(26,23,20,.09)] animate-wl-up max-[560px]:flex-wrap max-[560px]:gap-y-2.5 sm:gap-6 sm:px-[26px] sm:py-[18px] ${className}`}
      >
        <a
          href={blockerUrl(locale, "home", "banner")}
          hrefLang={locale}
          target="_blank"
          rel="noopener"
          {...CTA}
          aria-label="welock.in"
          className="flex shrink-0 items-center gap-[11px] no-underline"
        >
          <Mark size={34} />
          <span className="max-[560px]:hidden">
            <Wordmark size={19} />
          </span>
        </a>
        <span
          aria-hidden="true"
          className="h-[38px] w-px shrink-0 bg-[rgba(26,23,20,.14)] max-[560px]:hidden"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <p className="text-[15px] font-semibold leading-[1.3] tracking-[-0.012em] sm:text-[16.5px]">
            {t.headline}
          </p>
          <p className="text-[14px] leading-[1.45] text-[#7a7164] max-[720px]:hidden">
            {t.subline}
          </p>
        </div>
        <a
          href={blockerUrl(locale, "download", "banner")}
          hrefLang={locale}
          target="_blank"
          rel="noopener"
          {...CTA}
          className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-[#c8402f] px-4 text-[14px] font-bold tracking-[-0.01em] text-white no-underline shadow-[0_8px_20px_rgba(26,23,20,.16)] transition-[filter,box-shadow] duration-200 hover:brightness-[.88] hover:shadow-[0_12px_26px_rgba(26,23,20,.22)] max-[560px]:order-2 max-[560px]:w-full sm:h-12 sm:px-[26px] sm:text-[15px]"
        >
          {t.start}
          <ArrowIcon />
        </a>
        <button
          type="button"
          onClick={() => remember(BANNER_KEY, "1")}
          aria-label={t.close}
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[rgba(26,23,20,.05)] text-[#7a7164] transition-colors duration-150 hover:bg-[rgba(26,23,20,.13)] hover:text-[#1a1714] max-[560px]:order-1"
        >
          <CrossIcon size={14} />
        </button>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------------- */

export default function BlockerBanner({
  variant = "banner",
  className = "",
  retracted = false,
  away = false,
  domain = "",
}: {
  /** banner = the bottom bar (home) · dock = the rail and its pill (room) */
  variant?: Variant;
  className?: string;
  /** dock only: retracted by Deep Focus. */
  retracted?: boolean;
  /** dock only: the tab is hidden — coming back may bring the rail out. */
  away?: boolean;
  /** dock only: the reader's verified email domain, for their school's review. */
  domain?: string;
}) {
  const locale = useBlockerLocale();
  const t = BLOCKER_STRINGS[locale];
  if (variant === "dock")
    return (
      <Dock
        locale={locale}
        t={t}
        domain={domain}
        retracted={retracted}
        away={away}
      />
    );
  return <Banner locale={locale} t={t} className={className} />;
}
