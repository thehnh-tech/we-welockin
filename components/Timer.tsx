"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/time";
import { getPrefs } from "@/lib/prefs";

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
  // (not when opening a room whose timer ended long ago).
  useEffect(() => {
    if (!finished || firedRef.current) return;
    firedRef.current = true;
    if (remainingSec <= -2) return; // joined an already-ended session

    const prefs = getPrefs();
    if (prefs.sound) playChime();

    if (
      prefs.notifications &&
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
      prefs.reducedMotion ||
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
      let on = false;
      titleTimer = setInterval(() => {
        document.title = on ? original : "Session terminée — welock.in";
        on = !on;
      }, 1000);
    }

    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", onVisible);
      restore();
    };
  }, [finished, remainingSec]);

  const ringPx = big ? 300 : 190;
  const strokeW = big ? 11 : 8;
  const r = ringPx / 2 - strokeW - 2;
  const mid = ringPx / 2;
  const circumference = 2 * Math.PI * r;
  // Accent = the one live moment on screen; finished settles back to ink.
  const color = finished ? "#1a1714" : "#e07856";

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
            stroke="#e7e1d6"
            strokeWidth={strokeW}
          />
          <circle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${circumference * (1 - progress)}`}
            style={{ transition: "stroke-dashoffset 0.5s linear, stroke .3s" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span
            className="mb-1 flex items-center gap-1.5 font-semibold uppercase text-text3"
            style={{ fontSize: 11, letterSpacing: ".06em" }}
          >
            {!finished && (
              <span
                className="h-1.5 w-1.5 rounded-full animate-wl-live"
                style={{ background: "#e07856" }}
              />
            )}
            {finished ? "Terminé" : "Focus"}
          </span>
          <span
            className="font-bold leading-none text-ink tabular-nums"
            style={{ fontSize: big ? 72 : 46, letterSpacing: "-0.03em" }}
          >
            {finished ? "00:00" : formatClock(remainingSec)}
          </span>
        </div>
      </div>
      {/* Announced once by screen readers when the session ends. */}
      <span className="sr-only" role="status" aria-live="polite">
        {finished ? "Session terminée" : ""}
      </span>
    </div>
  );
}
