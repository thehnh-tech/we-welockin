"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/time";

type Props = {
  startedAt: number;
  durationSec: number;
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

export default function Timer({ startedAt, durationSec }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Ask once, up front, so we can still alert a backgrounded tab at the end.
  useEffect(() => {
    if (
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

    playChime();

    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification("Session terminée 🎉", {
          body: "Le minuteur est arrivé à zéro.",
        });
      } catch {}
    }

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
      document.title = "⏰ Terminé !";
    } else {
      let on = false;
      titleTimer = setInterval(() => {
        document.title = on ? original : "⏰ Terminé !";
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

  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className="relative w-56 h-56 md:w-72 md:h-72"
        role="timer"
        aria-label={
          finished
            ? "Session terminée"
            : `Temps restant : ${formatClock(remainingSec)}`
        }
      >
        <svg
          className="w-full h-full -rotate-90"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="4"
          />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke={finished ? "#34d399" : "#7c5cff"}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 46}`}
            strokeDashoffset={`${2 * Math.PI * 46 * (1 - progress)}`}
            style={{ transition: "stroke-dashoffset 0.5s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="font-mono text-4xl md:text-5xl font-bold tabular-nums"
            aria-hidden="true"
          >
            {finished ? "00:00" : formatClock(remainingSec)}
          </div>
          <div
            className="mt-2 text-xs uppercase tracking-widest text-white/50"
            aria-hidden="true"
          >
            {finished ? "Terminé" : "Focus"}
          </div>
        </div>
      </div>
      {/* Announced once by screen readers when the session ends. */}
      <span className="sr-only" role="status" aria-live="polite">
        {finished ? "Session terminée" : ""}
      </span>
    </div>
  );
}
