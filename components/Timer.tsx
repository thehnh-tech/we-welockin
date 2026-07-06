"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/time";
import { getPrefs, usePrefs } from "@/lib/prefs";

type Props = {
  startedAt: number;
  durationSec: number;
  big?: boolean; // focus-mode variant
};

// A short two-note chime synthesized via WebAudio — no asset to ship.
function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = (freq: number, start: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = freq;
      const t0 = ctx.currentTime + start;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.start(t0);
      o.stop(t0 + dur);
    };
    beep(880, 0, 0.35);
    beep(1175, 0.3, 0.45);
    window.setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {}
}

export default function Timer({ startedAt, durationSec, big = false }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);
  const prefs = usePrefs();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Ask once, up front, so we can still alert a backgrounded tab at the end
  // (only if the user keeps notifications enabled).
  useEffect(() => {
    if (
      getPrefs().notifications &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const elapsedSec = Math.floor((now - startedAt) / 1000);
  const remainingSec = durationSec - elapsedSec;
  const finished = remainingSec <= 0;
  const progress = Math.min(1, Math.max(0, elapsedSec / durationSec));

  // End-of-session feedback: fire exactly once, and only for a *fresh* finish
  // (not when opening a room whose timer ended long ago). Depends on `finished`
  // only — depending on the ticking remainingSec would re-run the effect every
  // 500ms and its cleanup would kill the title flash after one tick.
  useEffect(() => {
    if (!finished || firedRef.current) return;
    firedRef.current = true;
    const rem = durationSec - Math.floor((Date.now() - startedAt) / 1000);
    if (rem <= -2) return; // joined an already-ended session

    const p = getPrefs();
    if (p.sound) playChime();

    if (
      p.notifications &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification("Session over", {
          body: "The timer hit zero. Nice work.",
        });
      } catch {}
    }

    const reduceMotion =
      p.reducedMotion ||
      (typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

    const original = document.title;
    let titleTimer: ReturnType<typeof setInterval> | null = null;

    const restore = () => {
      if (titleTimer) {
        clearInterval(titleTimer);
        titleTimer = null;
      }
      document.title = original;
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") restore();
    };

    if (reduceMotion) {
      document.title = "Session over — welock.in";
    } else {
      // Bounded flash (~5 cycles) then a static title.
      let on = false;
      let cycles = 0;
      titleTimer = setInterval(() => {
        document.title = on ? original : "Session over — welock.in";
        on = !on;
        if (++cycles >= 10) {
          if (titleTimer) clearInterval(titleTimer);
          titleTimer = null;
          document.title = "Session over — welock.in";
        }
      }, 1000);
    }

    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", onVisible);
      restore();
    };
  }, [finished, startedAt, durationSec]);

  // Display: with seconds ("24:31") or rounded minutes ("25 min"), the last
  // minute always showing seconds so the end feels alive.
  const showSeconds = prefs.timerSeconds || remainingSec <= 60;
  const display = finished
    ? "00:00"
    : showSeconds
      ? formatClock(remainingSec)
      : `${Math.ceil(remainingSec / 60)} min`;

  const ariaLabel = finished
    ? "Session over"
    : `Time left: ${formatClock(remainingSec)}`;

  const label = (
    <span
      className="mt-2 font-semibold uppercase text-text3"
      style={{ fontSize: big ? 12 : 11, letterSpacing: ".14em" }}
    >
      {finished ? "Done" : "Focus"}
    </span>
  );

  const srStatus = (
    <span className="sr-only" role="status" aria-live="polite">
      {finished ? "Session over" : ""}
    </span>
  );

  if (prefs.timerStyle === "minimal") {
    return (
      <div
        className="flex flex-col items-center justify-center py-8"
        role="timer"
        aria-label={ariaLabel}
      >
        <div aria-hidden="true" className="flex flex-col items-center">
          <span
            className="font-bold leading-none text-ink tabular-nums"
            style={{ fontSize: big ? 110 : 88, letterSpacing: "-0.04em" }}
          >
            {display}
          </span>
          {label}
          <span
            className="mt-6 block h-[3px] w-56 overflow-hidden rounded-full"
            style={{ background: "var(--wl-track)" }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${progress * 100}%`,
                background: finished ? "var(--wl-ink)" : "var(--wl-accent)",
                transition: "width .5s linear, background-color .3s",
              }}
            />
          </span>
        </div>
        {srStatus}
      </div>
    );
  }

  const ringPx = big ? 340 : 260;
  const strokeW = 7;
  const r = ringPx / 2 - strokeW - 2;
  const mid = ringPx / 2;
  const circumference = 2 * Math.PI * r;
  const color = finished ? "var(--wl-ink)" : "var(--wl-accent)";

  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className="relative transition-all duration-300 ease-wl"
        style={{ width: ringPx, height: ringPx }}
        role="timer"
        aria-label={ariaLabel}
      >
        <svg
          className="relative -rotate-90"
          width={ringPx}
          height={ringPx}
          viewBox={`0 0 ${ringPx} ${ringPx}`}
          aria-hidden="true"
        >
          <circle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            style={{ stroke: "var(--wl-track)" }}
            strokeWidth={strokeW}
          />
          <circle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${circumference * (1 - progress)}`}
            style={{
              stroke: color,
              transition: "stroke-dashoffset 0.5s linear, stroke .3s",
            }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span
            className="font-bold leading-none text-ink tabular-nums"
            style={{
              fontSize: big ? 76 : showSeconds ? 56 : 50,
              letterSpacing: "-0.04em",
            }}
          >
            {display}
          </span>
          {label}
        </div>
      </div>
      {srStatus}
    </div>
  );
}
