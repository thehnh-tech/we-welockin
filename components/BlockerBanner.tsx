"use client";

import { useEffect, useRef, useState } from "react";

// The blocker is a product of the marketing site, not of this app — so the
// link always opens a new tab: clicking it from inside a room must never tear
// down a live session. Overridable for staging (NEXT_PUBLIC_*: inlined at
// build time, so it is readable from this client component).
const BLOCKER_URL = process.env.NEXT_PUBLIC_BLOCKER_URL || "https://welock.in";

const HEADLINE = "Block what breaks your focus";
const BODY =
  "Apps and sites that distract you — shut off for as long as you need.";
const PLATFORMS = "iOS · macOS · Windows · Android";

/* -------------------------------------------------------------------------
   Glyphs
------------------------------------------------------------------------- */

// The universal "blocked" sign — it still reads at 14px, where a shield would
// turn to mush.
function BlockIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M5.64 5.64l12.72 12.72" />
    </svg>
  );
}

function ArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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

// Platform marks — one distinct glyph per platform, in the order the caption
// names them. The two Apple platforms would otherwise share the one apple, so
// macOS takes the Command loop: the key that only exists on a Mac, and the
// only other Apple mark that holds up as a 15px monochrome symbol.
//
// Each <title> is the glyph's own tooltip; the row as a whole is one image to
// a screen reader, so the marks are not announced four times over.
function PlatformMarks({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex w-fit items-center gap-[9px] ${className}`}
      role="img"
      aria-label="Available on iOS, macOS, Windows and Android"
    >
      {/* iOS — the Apple mark */}
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <title>iOS</title>
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
      {/* macOS — the Command loop */}
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <title>macOS</title>
        <path d="M8.4 5.6A2.8 2.8 0 105.6 8.4H18.4A2.8 2.8 0 1015.6 5.6V18.4A2.8 2.8 0 1018.4 15.6H5.6A2.8 2.8 0 108.4 18.4Z" />
      </svg>
      {/* Windows */}
      <svg
        width="12.5"
        height="12.5"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <title>Windows</title>
        <path d="M0 3.45L9.75 2.1v9.45H0zM10.95 1.95L24 0v11.55H10.95zM0 12.45h9.75v9.45L0 20.55zM10.95 12.45H24V24l-13.05-1.95z" />
      </svg>
      {/* Android */}
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <title>Android</title>
        <path
          fillRule="evenodd"
          fill="currentColor"
          d="M2.4 17.5a9.6 9.6 0 0119.2 0zM8.2 13.2a1.05 1.05 0 100-2.1 1.05 1.05 0 000 2.1zM15.8 13.2a1.05 1.05 0 100-2.1 1.05 1.05 0 000 2.1z"
        />
        <path
          d="M6.6 9.6L4.5 6.1M17.4 9.6l2.1-3.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

// Warm halo bleeding out of a corner — the one flourish that keeps the ink
// card from reading as a flat black rectangle on the paper canvas.
function Halo({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute rounded-full opacity-[.20] blur-2xl transition-opacity duration-300 ease-wl group-hover:opacity-[.32] ${className}`}
      style={{ background: "var(--wl-accent)" }}
    />
  );
}

/* -------------------------------------------------------------------------
   Variants
------------------------------------------------------------------------- */

type Variant = "panel" | "strip" | "dock";

// Shared shell: an ink card — a different world than the paper canvas
// (charte §01) — hairline in the band tone, lift on hover. Positioning is
// left to each variant on purpose: Tailwind emits `.relative` after
// `.absolute`, so a `relative` in here would quietly win over the dock's
// `absolute` and drop the card out of its corner.
const SHELL =
  "wl-lift group overflow-hidden border border-bandline bg-band text-bandtext no-underline";

function Panel({ className = "" }: { className?: string }) {
  return (
    <a
      href={BLOCKER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`${SHELL} relative flex flex-col justify-between rounded-[16px] p-6 shadow-md ${className}`}
    >
      <Halo className="-right-14 -top-16 h-44 w-44" />

      <div className="relative">
        <div className="mb-3.5 flex items-center gap-2">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-bandline bg-bandchip text-accent">
            <BlockIcon size={15} />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-bandtext3">
            welock.in blocker
          </span>
        </div>
        <div
          className="text-[20px] font-bold leading-[1.18]"
          style={{ letterSpacing: "-0.02em" }}
        >
          Block the apps and sites
          <br />
          that distract you
          <span className="text-accent">.</span>
        </div>
        <p className="mt-2 text-[13px] leading-[1.5] text-bandtext2">
          Switch it on when you need to focus — on every device you study from.
        </p>
      </div>

      <div className="relative mt-6 flex items-end justify-between gap-3">
        <span className="block">
          <PlatformMarks className="text-bandtext2" />
          <span className="mt-[7px] block text-[10.5px] font-medium text-bandtext3">
            {PLATFORMS}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-bandactive px-4 py-2 text-[13px] font-bold text-bandactivetext shadow-xs">
          Get it
          <ArrowIcon />
        </span>
      </div>
    </a>
  );
}

function Strip({ className = "" }: { className?: string }) {
  return (
    <a
      href={BLOCKER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`${SHELL} relative flex flex-wrap items-center gap-x-5 gap-y-3.5 rounded-[16px] px-5 py-4 shadow-sm ${className}`}
    >
      <Halo className="-left-12 -top-14 h-40 w-40" />

      <span className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] border border-bandline bg-bandchip text-accent">
        <BlockIcon size={16} />
      </span>

      {/* min-w: below it the copy would rather wrap the CTA onto its own
          line than squeeze itself into a one-word-per-line column. */}
      <span className="relative min-w-[200px] flex-1">
        <span
          className="block text-[14.5px] font-bold"
          style={{ letterSpacing: "-0.01em" }}
        >
          Block the apps and sites that distract you
        </span>
        <span className="mt-0.5 block text-[12.5px] text-bandtext2">
          Switch it on when you need to focus. {PLATFORMS}
        </span>
      </span>

      <PlatformMarks className="relative text-bandtext3 max-[620px]:hidden" />

      <span className="relative flex shrink-0 items-center gap-1.5 rounded-full bg-bandactive px-4 py-2 text-[13px] font-bold text-bandactivetext shadow-xs">
        Get the blocker
        <ArrowIcon />
      </span>
    </a>
  );
}

// The in-room dock. It retracts into a small round button — driven from the
// outside by `retracted` (Deep Focus), and by hand from the card's own close
// button.
//
// Retracting is a cross-fade between two elements anchored to the same
// corner, not an animated width/height: the card has no fixed height to
// animate to, and `origin-top-right` already reads as being pulled back into
// the corner it came from.
function Dock({ retracted = false }: { retracted?: boolean }) {
  const [open, setOpen] = useState(true);
  // Mirrors `open` for the effects below, which have to read it without
  // re-running every time the user opens or closes the dock by hand.
  const openRef = useRef(true);
  const setDock = (next: boolean) => {
    openRef.current = next;
    setOpen(next);
  };

  // Narrow viewports: an expanded card would sit on top of the timer, so it
  // starts retracted there — still openable by hand.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => {
      if (mq.matches) setDock(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Deep Focus retracts the dock; leaving Deep Focus restores only what was
  // there before it — a card you had closed by hand stays closed.
  const wasOpen = useRef(true);
  const prevRetracted = useRef(retracted);
  useEffect(() => {
    if (prevRetracted.current === retracted) return;
    prevRetracted.current = retracted;
    if (retracted) {
      wasOpen.current = openRef.current;
      setDock(false);
    } else if (wasOpen.current) {
      setDock(true);
    }
  }, [retracted]);

  return (
    // Anchored to the room column, not to the scroller: it stays in its
    // corner while the tiles scroll under it. 78px clears the ink band header
    // (66px tall); the 46px box is the retracted button's, and the expanded
    // card simply overflows it to the left.
    <div className="absolute right-4 top-[78px] z-30 h-[46px] w-[46px]">
      {/* Expanded card. The max-width keeps it off both edges on a narrow
          phone — underscores, not spaces: Tailwind turns them back into the
          spaces `calc` needs, and a spaceless `calc(100vw-32px)` is invalid
          CSS that silently drops the whole declaration. */}
      <div
        aria-hidden={!open}
        className={`${SHELL} absolute right-0 top-0 w-[300px] max-w-[calc(100vw_-_32px)] origin-top-right rounded-[16px] p-4 shadow-lg transition-all duration-300 ease-wl ${
          open
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-[.92] opacity-0"
        }`}
      >
        <Halo className="-right-12 -top-14 h-36 w-36" />

        <div className="relative flex items-start gap-2.5">
          <span className="mt-px flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[9px] border border-bandline bg-bandchip text-accent">
            <BlockIcon size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block text-[13px] font-bold leading-tight"
              style={{ letterSpacing: "-0.01em" }}
            >
              {HEADLINE}
            </span>
            <span className="mt-1 block text-[12px] leading-[1.45] text-bandtext2">
              {BODY}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setDock(false)}
            tabIndex={open ? undefined : -1}
            aria-label="Retract the blocker banner"
            className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-bandtext3 transition-colors duration-150 hover:bg-bandchip hover:text-bandtext"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="relative mt-3 flex items-center justify-between gap-2 border-t border-bandline pt-3">
          <PlatformMarks className="text-bandtext3" />
          <a
            href={BLOCKER_URL}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={open ? undefined : -1}
            className="flex items-center gap-1.5 rounded-full bg-bandactive px-3.5 py-[7px] text-[12px] font-bold text-bandactivetext no-underline shadow-xs transition-transform duration-200 ease-wl hover:-translate-y-px"
          >
            Get it
            <ArrowIcon size={13} />
          </a>
        </div>
      </div>

      {/* Retracted button */}
      <button
        type="button"
        onClick={() => setDock(true)}
        aria-expanded={open}
        aria-label="Show the blocker banner"
        title="Block distracting apps and sites"
        className={`absolute right-0 top-0 flex h-[46px] w-[46px] origin-top-right items-center justify-center rounded-full border border-bandline bg-band text-accent shadow-lg transition-all duration-300 ease-wl hover:-translate-y-px ${
          open
            ? "pointer-events-none scale-50 opacity-0"
            : "scale-100 opacity-100"
        }`}
      >
        <BlockIcon size={17} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export default function BlockerBanner({
  variant = "panel",
  className = "",
  retracted = false,
}: {
  /** panel = home right column · strip = full-width band · dock = in-room */
  variant?: Variant;
  className?: string;
  /** dock only: pulled in by Deep Focus. */
  retracted?: boolean;
}) {
  if (variant === "dock") return <Dock retracted={retracted} />;
  if (variant === "strip") return <Strip className={className} />;
  return <Panel className={className} />;
}
