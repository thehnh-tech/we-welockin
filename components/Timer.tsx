"use client";

import { useEffect, useState } from "react";

type Props = {
  startedAt: number;
  durationSec: number;
};

function format(seconds: number): string {
  const abs = Math.max(0, Math.floor(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function Timer({ startedAt, durationSec }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const elapsedSec = Math.floor((now - startedAt) / 1000);
  const remainingSec = durationSec - elapsedSec;
  const finished = remainingSec <= 0;
  const progress = Math.min(1, Math.max(0, elapsedSec / durationSec));

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-56 h-56 md:w-72 md:h-72">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
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
          <div className="font-mono text-4xl md:text-5xl font-bold tabular-nums">
            {finished ? "00:00" : format(remainingSec)}
          </div>
          <div className="mt-2 text-xs uppercase tracking-widest text-white/50">
            {finished ? "Terminé" : "Focus"}
          </div>
        </div>
      </div>
    </div>
  );
}
