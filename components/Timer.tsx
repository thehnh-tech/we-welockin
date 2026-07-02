"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/time";

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

  // Mockup geometry: 168px ring (300px in focus mode).
  const ringPx = big ? 300 : 168;
  const strokeW = big ? 11 : 8;
  const r = ringPx / 2 - strokeW - 2;
  const mid = ringPx / 2;
  const circumference = 2 * Math.PI * r;
  const color = finished ? "#22c55e" : "#6366f1";

  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className="relative transition-all duration-300"
        style={{ width: ringPx, height: ringPx }}
        role="timer"
        aria-label={
          finished
            ? "Session terminée"
            : `Temps restant : ${formatClock(remainingSec)}`
        }
      >
        <span
          aria-hidden="true"
          className="absolute rounded-full animate-wl-breathe"
          style={{
            inset: 14,
            background: color,
            filter: `blur(${big ? 44 : 24}px)`,
          }}
        />
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
            stroke="#26262a"
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
            style={{ transition: "stroke-dashoffset 0.5s linear" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span
            className="font-bold uppercase"
            style={{
              fontSize: big ? 13 : 10,
              letterSpacing: ".16em",
              color: finished ? "#4ade80" : "#818cf8",
              marginBottom: 3,
            }}
          >
            {finished ? "Terminé" : "Focus"}
          </span>
          <span
            className="font-mono font-bold leading-none tracking-tight text-white tabular-nums"
            style={{ fontSize: big ? 56 : 26 }}
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
