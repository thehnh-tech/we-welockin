"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  BLOCKER_SIDEBAR,
  BLOCKER_STRINGS,
  blockerUrl,
  pickBlockerLocale,
  type BlockerLocale,
  type BlockerPlacement,
  type BlockerStrings,
} from "@/lib/blocker";
import { BLOCKER_REVIEWS } from "@/lib/blockerReviews";

// The welock.in blocker promo, in the three shapes of the v2 ad kit: a
// cream bar pinned to the bottom of the page (banner), a pill in the bottom
// corner that opens into a card (bubble), and the sidebar unit in the home
// page's right column — headline, bullets, CTA and the site's seven student
// reviews rotating underneath.
//
// It is the brand's world, not the app's: cream paper, ink and welock.in red
// whatever theme the app is in — the same line the ink band draws, in the
// other direction. Copy comes from lib/blocker, in the browser's language.
//
// Search-friendly by construction: real text in an <aside> landmark tagged
// with its language; links that land on welock.in's canonical host, on the
// page in that language, and say so (hreflang); an inline SVG mark (no
// request, no layout shift); and everything server-rendered in English so
// the markup is in the HTML before hydration — the language and any
// dismissal apply right after, through useSyncExternalStore, never as a
// mismatch. The links keep their referrer (rel is noopener only): the
// referral is the point.

/* -------------------------------------------------------------------------
   Browser state — language and dismissals
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

// The banner closes for good (localStorage); the bubble's "Not now" lasts
// the session (sessionStorage). Without storage, a dismissal still holds for
// the life of the page.
const BANNER_KEY = "wlis_blocker_banner_v1";
const BUBBLE_KEY = "wlis_blocker_bubble_v1";

const dismissedNow = new Set<string>();
const dismissListeners = new Set<() => void>();
function subscribeDismissals(onChange: () => void) {
  dismissListeners.add(onChange);
  return () => {
    dismissListeners.delete(onChange);
  };
}
function storageFor(key: string): Storage {
  return key === BANNER_KEY ? localStorage : sessionStorage;
}
function isDismissed(key: string): boolean {
  if (dismissedNow.has(key)) return true;
  try {
    return storageFor(key).getItem(key) === "1";
  } catch {
    return false;
  }
}
function dismiss(key: string) {
  dismissedNow.add(key);
  try {
    storageFor(key).setItem(key, "1");
  } catch {}
  dismissListeners.forEach((l) => l());
}
function useDismissed(key: string): boolean {
  return useSyncExternalStore(
    subscribeDismissals,
    () => isDismissed(key),
    () => false
  );
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

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#c8402f"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-[3px]"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* -------------------------------------------------------------------------
   The card — the panel on its own, and the bubble once opened
------------------------------------------------------------------------- */

const CARD =
  "rounded-[20px] border border-[rgba(26,23,20,.1)] bg-[#f5f0e8] p-[22px] text-[#1a1714]";

function CardTop({ t, onClose }: { t: BlockerStrings; onClose?: () => void }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <Mark size={28} />
        <Wordmark size={16} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="ml-auto flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[rgba(26,23,20,.06)] text-[#7a7164] transition-colors duration-150 hover:bg-[rgba(26,23,20,.14)] hover:text-[#1a1714]"
          >
            <CrossIcon size={13} />
          </button>
        )}
      </div>
      <p className="mb-3 text-[22px] font-semibold leading-[1.16] tracking-[-0.022em]">
        {t.headline}
      </p>
      <ul className="flex flex-col gap-[9px]">
        {t.bullets.map((b) => (
          <li
            key={b}
            className="grid grid-cols-[auto_1fr] items-start gap-2.5 text-[13.5px] leading-[1.45] text-[#433d36]"
          >
            <CheckIcon />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardActions({
  t,
  locale,
  placement,
  onDismiss,
}: {
  t: BlockerStrings;
  locale: BlockerLocale;
  placement: BlockerPlacement;
  onDismiss?: () => void;
}) {
  return (
    <div className="mt-[18px]">
      <a
        href={blockerUrl(locale, "download", placement)}
        hrefLang={locale}
        target="_blank"
        rel="noopener"
        className="flex h-12 items-center justify-center rounded-[12px] bg-[#1a1714] text-[15px] font-bold tracking-[-0.01em] text-[#fbf8f2] no-underline transition-colors duration-200 hover:bg-[#c8402f]"
      >
        {t.download}
      </a>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2.5 block w-full py-1.5 text-[13px] font-medium text-[#8a8175] transition-colors duration-150 hover:text-[#1a1714]"
        >
          {t.notNow}
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Variants
------------------------------------------------------------------------- */

type Variant = "sidebar" | "banner" | "bubble";

type VariantProps = { locale: BlockerLocale; t: BlockerStrings };

// Home, right column: the sidebar unit. Headline, three bullets, the CTA,
// then the seven student reviews from welock.in, one at a time, rotating
// every seven seconds. Hovering, focusing or picking a dot stops the
// rotation for good, and it never starts under a reduced-motion preference
// (system or app): text changing under a reader is motion too.
const ROTATE_MS = 7000;

function Sidebar({
  locale,
  t,
  className = "",
}: VariantProps & { className?: string }) {
  const s = BLOCKER_SIDEBAR[locale];
  const [index, setIndex] = useState(0);
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

  const review = BLOCKER_REVIEWS[index];

  return (
    <aside
      lang={locale}
      aria-label={t.label}
      onMouseEnter={stop}
      onFocus={stop}
      className={`rounded-[18px] border border-[rgba(26,23,20,.09)] bg-[#fbf8f2] px-[22px] pb-[22px] pt-6 text-[#1a1714] shadow-[0_10px_28px_rgba(26,23,20,.07)] ${className}`}
    >
      <div className="mb-5 flex items-center gap-2.5">
        <Mark size={26} />
        <Wordmark size={15} />
      </div>

      <p className="mb-5 text-[29px] font-bold leading-[1.14] tracking-[-0.028em]">
        {s.headline[0]}
        <span className="rounded-[3px] bg-[#f0d4ca] px-[5px] py-px">
          {s.headline[1]}
        </span>
        {s.headline[2]}
      </p>

      <ul className="mb-[22px] flex flex-col gap-3">
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
        href={blockerUrl(locale, "download", "sidebar")}
        hrefLang={locale}
        target="_blank"
        rel="noopener"
        className="flex h-[54px] items-center justify-center rounded-full border-[1.5px] border-[#1a1714] bg-[#f0d4ca] text-[16px] font-bold tracking-[-0.012em] text-[#1a1714] no-underline transition-colors duration-200 hover:bg-[#1a1714] hover:text-[#fbf8f2]"
      >
        {s.cta}
      </a>

      <div className="mt-[22px] border-t border-[rgba(26,23,20,.11)] pt-5">
        {/* Keyed on the person so a change re-runs the fade-in. min-height,
            not height: a long translation grows the unit rather than
            spilling out of it. */}
        <figure
          key={review.who}
          className="flex min-h-[262px] flex-col justify-between animate-wl-rise"
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
          {BLOCKER_REVIEWS.map((r, n) => (
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

// Home: the cream bar pinned to the bottom of the viewport. Slides up on
// load, closes for good on the cross. The in-flow spacer keeps the page's
// last content scrollable clear of it (the bar is fixed, so it takes no
// space of its own). On a phone the CTA drops to its own row under the
// copy: side by side, the headline would wrap four deep beside it.
function Banner({
  locale,
  t,
  className = "",
}: VariantProps & { className?: string }) {
  const dismissed = useDismissed(BANNER_KEY);
  if (dismissed) return null;
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
          className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-[#c8402f] px-4 text-[14px] font-bold tracking-[-0.01em] text-white no-underline shadow-[0_8px_20px_rgba(26,23,20,.16)] transition-[filter,box-shadow] duration-200 hover:brightness-[.88] hover:shadow-[0_12px_26px_rgba(26,23,20,.22)] max-[560px]:order-2 max-[560px]:w-full sm:h-12 sm:px-[26px] sm:text-[15px]"
        >
          {t.start}
          <ArrowIcon />
        </a>
        <button
          type="button"
          onClick={() => dismiss(BANNER_KEY)}
          aria-label={t.close}
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[rgba(26,23,20,.05)] text-[#7a7164] transition-colors duration-150 hover:bg-[rgba(26,23,20,.13)] hover:text-[#1a1714] max-[560px]:order-1"
        >
          <CrossIcon size={14} />
        </button>
      </aside>
    </>
  );
}

// In a room: a pill in the bottom-right corner of the room column that opens
// into the card. Escape or the cross fold it back; "Not now" removes it for
// the session.
function Bubble({
  locale,
  t,
  retracted,
}: VariantProps & { retracted: boolean }) {
  const gone = useDismissed(BUBBLE_KEY);
  const [open, setOpen] = useState(false);

  // Deep Focus folds the card back into the pill, and leaving it restores
  // only what was there before: a card you closed by hand stays closed.
  // Adjusted during render (React's pattern for reacting to a prop change),
  // not in an effect, so there is no frame with the card still up.
  const [wasOpen, setWasOpen] = useState(false);
  const [prevRetracted, setPrevRetracted] = useState(retracted);
  if (retracted !== prevRetracted) {
    setPrevRetracted(retracted);
    if (retracted) {
      setWasOpen(open);
      setOpen(false);
    } else if (wasOpen) {
      setOpen(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (gone) return null;

  return (
    // Anchored to the room column (relative), not to the scroller: the
    // corner stays put while the tiles scroll under it. Both states grow out
    // of the same bottom-right corner.
    <div lang={locale} className="absolute bottom-4 right-4 z-30">
      {open ? (
        <aside
          aria-label={t.label}
          className={`${CARD} w-[320px] max-w-[calc(100vw_-_32px)] shadow-[0_26px_56px_rgba(26,23,20,.26)] animate-wl-pop`}
        >
          <CardTop t={t} onClose={() => setOpen(false)} />
          <CardActions
            t={t}
            locale={locale}
            placement="bubble"
            onDismiss={() => {
              setOpen(false);
              dismiss(BUBBLE_KEY);
            }}
          />
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-14 items-center gap-3 rounded-full border border-[rgba(26,23,20,.08)] bg-[#fbf8f2] pl-[9px] pr-[22px] text-left shadow-[0_16px_34px_rgba(26,23,20,.2)] transition-[box-shadow,background-color] duration-200 hover:bg-white hover:shadow-[0_20px_42px_rgba(26,23,20,.28)] animate-wl-rise"
        >
          <Mark size={38} />
          <span className="flex flex-col items-start leading-[1.22]">
            <span className="text-[15px] font-bold tracking-[-0.015em] text-[#1a1714]">
              {t.pillTitle}
            </span>
            <span className="text-[12.5px] text-[#7a7164]">{t.pillSub}</span>
          </span>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export default function BlockerBanner({
  variant = "sidebar",
  className = "",
  retracted = false,
}: {
  /** sidebar = home right column · banner = bottom bar · bubble = in-room */
  variant?: Variant;
  className?: string;
  /** bubble only: folded back into its pill by Deep Focus. */
  retracted?: boolean;
}) {
  const locale = useBlockerLocale();
  const t = BLOCKER_STRINGS[locale];
  if (variant === "bubble")
    return <Bubble locale={locale} t={t} retracted={retracted} />;
  if (variant === "banner")
    return <Banner locale={locale} t={t} className={className} />;
  return <Sidebar locale={locale} t={t} className={className} />;
}
