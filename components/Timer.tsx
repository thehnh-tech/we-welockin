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
        new Notification("Session terminée", {
          body: "Le timer est arrivé à zéro. Bien joué.",
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
      document.title = "Session terminée — welock.in";
    } else {
      // Bounded flash (~5 cycles) then a static title.
      let on = false;
      let cycles = 0;
      titleTimer = setInterval(() => {
        document.title = on ? original : "Session terminée — welock.in";
        on = !on;
        if (++cycles >= 10) {
          if (titleTimer) clearInterval(titleTimer);
          titleTimer = null;
          document.title = "Session terminée — welock.in";
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

  const minimal = prefs.timerStyle === "minimal";
  const ringPx = big ? 300 : 190;
  const strokeW = big ? 11 : 8;
  const r = ringPx / 2 - strokeW - 2;
  const mid = ringPx / 2;
  const circumference = 2 * Math.PI * r;
  const color = finished ? "var(--wl-ink)" : "var(--wl-accent)";

  const eyebrow = (
    <span
      className="mb-1 flex items-center gap-1.5 font-semibold uppercase text-text2"
      style={{ fontSize: 11, letterSpacing: ".06em" }}
    >
      {!finished && (
        <span
          className="h-1.5 w-1.5 rounded-full animate-wl-live"
          style={{ background: "var(--wl-accent)" }}
        />
      )}
      {finished ? "Terminé" : "Focus"}
    </span>
  );

  const srStatus = (
    <span className="sr-only" role="status" aria-live="polite">
      {finished ? "Session terminée" : ""}
    </span>
  );

  if (minimal) {
    return (
      <div
        className="flex flex-col items-center justify-center py-6"
        role="timer"
        aria-label={
          finished
            ? "Session terminée"
            : `Temps restant : ${formatClock(remainingSec)}`
        }
      >
        <div aria-hidden="true" className="flex flex-col items-center">
          {eyebrow}
          <span
            className="font-bold leading-none text-ink tabular-nums"
            style={{ fontSize: big ? 96 : 64, letterSpacing: "-0.03em" }}
          >
            {display}
          </span>
          <span
            className="mt-5 block h-[3px] w-44 overflow-hidden rounded-full"
            style={{ background: "var(--wl-track)" }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${progress * 100}%`,
                background: color,
                transition: "width .5s linear, background-color .3s",
              }}
            />
          </span>
        </div>
        {srStatus}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className="relative transition-all duration-300 ease-wl"
        style={{ width: ringPx, height: ringPx }}
        role="timer"
        aria-label={
          finished
            ? "Session terminée"
            : `Temps restant : ${formatClock(remainingSec)}`
        }
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
          {eyebrow}
          <span
            className="font-bold leading-none text-ink tabular-nums"
            style={{
              fontSize: big ? 68 : showSeconds ? 44 : 40,
              letterSpacing: "-0.03em",
            }}
          >
            {display}
          </span>
        </div>
      </div>
      {srStatus}
    </div>
  );
}
