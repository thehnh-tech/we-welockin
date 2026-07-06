"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getPseudo, setPseudo } from "@/lib/cookies";
import { buildRoomUrl } from "@/lib/roomLink";
import { generateRoomId, normalizeRoomCode } from "@/lib/roomCode";
import { formatClock, formatShortDuration } from "@/lib/time";
import { getStreakDays, getTodaySeconds, getWeekSeconds } from "@/lib/stats";
import { ROOMS_POLL_MS } from "@/lib/constants";
import { usePrefs } from "@/lib/prefs";
import Avatar from "@/components/Avatar";
import Padlock from "@/components/Padlock";
import SettingsMenu from "@/components/SettingsMenu";

type RoomView = {
  id: string;
  name: string;
  subject: string;
  durationSec: number;
  startedAt: number;
  peerCount: number;
  deep: boolean;
  peerNames: string[];
};

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DURATION_PRESETS = [25, 50, 90]; // minutes
const MAX_MINUTES = 480;

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default function HomePage() {
  const router = useRouter();
  const prefs = usePrefs();
  const [pseudo, setPseudoState] = useState<string | null>(null);
  const [pseudoInput, setPseudoInput] = useState("");
  const [rooms, setRooms] = useState<RoomView[]>([]);
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [presetMinutes, setPresetMinutes] = useState<number | "custom">(25);
  const [customMinutes, setCustomMinutes] = useState("45");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [stats, setStats] = useState({ today: 0, week: 0, streak: 0 });
  const [greeting, setGreeting] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setPseudoState(getPseudo());
    const d = new Date();
    setGreeting(`${DAYS[d.getDay()]} · Week ${isoWeek(d)}`);
    setStats({
      today: getTodaySeconds(),
      week: getWeekSeconds(),
      streak: getStreakDays(),
    });
  }, []);

  // Tick the live timers on the room rows.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!pseudo) return;
    let alive = true;
    const fetchRooms = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/rooms", { cache: "no-store" });
        const data = await res.json();
        if (alive) setRooms(data.rooms ?? []);
      } catch {}
    };
    fetchRooms();
    const t = setInterval(fetchRooms, ROOMS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pseudo]);

  const liveCount = useMemo(
    () => rooms.reduce((a, r) => a + r.peerCount, 0),
    [rooms]
  );

  // Resolved timer length in minutes, clamped in JS — no native validation
  // bubbles ("value must be less than or equal to…").
  const resolvedMinutes = useMemo(() => {
    if (presetMinutes !== "custom") return presetMinutes;
    const n = parseInt(customMinutes, 10);
    if (!Number.isFinite(n) || n < 1) return 25;
    return Math.min(MAX_MINUTES, n);
  }, [presetMinutes, customMinutes]);

  const submitPseudo = (e: React.FormEvent) => {
    e.preventDefault();
    const v = pseudoInput.trim();
    if (!v) return;
    setPseudo(v);
    setPseudoState(v);
  };

  const createRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const id = generateRoomId();
    const name = newName.trim() || "Study session";
    const durationSec = Math.max(60, Math.min(8 * 3600, resolvedMinutes * 60));
    const startedAt = Date.now();
    router.push(
      buildRoomUrl({
        id,
        name,
        durationSec,
        startedAt,
        subject: newSubject.trim() || undefined,
      })
    );
  };

  const joinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeRoomCode(codeInput);
    if (!code) {
      setCodeError(true);
      return;
    }
    setCodeError(false);
    router.push(`/room/${encodeURIComponent(code)}`);
  };

  if (!pseudo) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <form
          onSubmit={submitPseudo}
          className="w-full max-w-sm space-y-5 rounded-[20px] border border-hairline bg-surface p-7 shadow-modal animate-wl-rise"
        >
          <div className="flex items-center gap-2 text-ink">
            <Padlock size={22} />
            <span className="text-[15px] font-bold tracking-tight">
              welock<span className="text-accentink">.in</span>
            </span>
          </div>
          <div>
            <h1
              className="text-2xl font-bold text-ink"
              style={{ letterSpacing: "-0.02em" }}
            >
              Hey, ready to lock in?
            </h1>
            <p className="mt-1 text-sm text-text2">
              Pick a name to join your crew.
            </p>
          </div>
          <input
            autoFocus
            value={pseudoInput}
            onChange={(e) => setPseudoInput(e.target.value)}
            placeholder="Your name"
            maxLength={30}
            aria-label="Your name"
            className="w-full rounded-[11px] border border-strong bg-surface px-3.5 py-2.5 text-ink outline-none transition-colors duration-150 focus:border-accentink"
          />
          <button
            type="submit"
            disabled={!pseudoInput.trim()}
            className="wl-lift w-full rounded-full bg-accentink py-2.5 text-sm font-bold shadow-sm disabled:bg-track disabled:text-faint"
            style={{ color: "#fffefb" }}
          >
            Lock in
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen pb-16">
      {/* ---- Ink band: header + hero + stats — a different world than the
             paper canvas below. ---- */}
      <div className="bg-band text-bandtext">
        <header className="mx-auto flex max-w-[1020px] items-center justify-between px-7 py-4">
          <div className="flex items-center gap-2">
            <Padlock size={22} />
            <span className="text-[15px] font-bold tracking-tight">
              welock<span className="text-accent">.in</span>
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center gap-[7px] rounded-full border border-bandline bg-bandchip px-3 py-[7px] text-bandtext2"
              title="Consecutive days of focus"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
              </svg>
              <span className="text-[13px] font-bold text-bandtext tabular-nums">
                {stats.streak}
              </span>
              <span className="text-xs font-medium">day streak</span>
            </div>
            <SettingsMenu
              pseudo={pseudo}
              onPseudoChange={setPseudoState}
              tone="band"
            />
            <Avatar
              username={pseudo}
              tintKey={prefs.tint}
              size={34}
              rounded="11px"
            />
          </div>
        </header>

        <div className="mx-auto max-w-[1020px] px-7 pb-10 pt-7 animate-wl-rise">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-bandtext2">
            {greeting}
          </div>
          <h1
            className="mb-2 font-bold"
            style={{
              fontSize: "clamp(30px, 5vw, 46px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            Hey {pseudo},
            <br />
            <span className="text-accent">lock in.</span>
          </h1>
          <p className="mb-8 text-[15px] text-bandtext2">
            Start a room or join a crew already studying.
          </p>

          <dl className="flex flex-wrap gap-x-10 gap-y-4">
            <div className="min-w-[110px]">
              <dt className="order-2 text-[13px] text-bandtext2">
                Focused today
              </dt>
              <dd
                className="m-0 text-[30px] font-bold leading-tight tabular-nums"
                style={{ letterSpacing: "-0.03em" }}
              >
                {formatShortDuration(stats.today)}
              </dd>
            </div>
            <div className="min-w-[110px] border-l border-bandline pl-10 max-[560px]:border-0 max-[560px]:pl-0">
              <dt className="order-2 text-[13px] text-bandtext2">Day streak</dt>
              <dd
                className="m-0 text-[30px] font-bold leading-tight tabular-nums"
                style={{ letterSpacing: "-0.03em" }}
              >
                {stats.streak}
              </dd>
            </div>
            <div className="min-w-[110px] border-l border-bandline pl-10 max-[560px]:border-0 max-[560px]:pl-0">
              <dt className="order-2 text-[13px] text-bandtext2">This week</dt>
              <dd
                className="m-0 text-[30px] font-bold leading-tight tabular-nums"
                style={{ letterSpacing: "-0.03em" }}
              >
                {stats.week >= 3600
                  ? `${Math.round(stats.week / 3600)}h`
                  : formatShortDuration(stats.week)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* ---- Paper canvas ---- */}
      <main className="mx-auto max-w-[1020px] px-7">
        <div
          className="wl-hero -mt-6 mb-9 grid grid-cols-[1.4fr_1fr] gap-4 max-[720px]:grid-cols-1 animate-wl-rise"
          style={{ animationDelay: ".05s" }}
        >
          <div className="rounded-[16px] border border-hairline bg-surface p-6 shadow-md">
            <form onSubmit={createRoom}>
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-text3">
                New room
              </div>
              <div
                className="mb-4 text-[21px] font-bold text-ink"
                style={{ letterSpacing: "-0.02em" }}
              >
                Start a focus room
              </div>
              <div className="flex flex-col gap-2.5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name (e.g. Organic chem finals)"
                  maxLength={60}
                  aria-label="Room name"
                  className="w-full rounded-[11px] border border-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors duration-150 focus:border-accentink"
                />
                <input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Subject (optional)"
                  maxLength={60}
                  aria-label="Subject"
                  className="w-full rounded-[11px] border border-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors duration-150 focus:border-accentink"
                />

                {/* Timer length — selection pills (charter pattern), no native
                    number-input validation bubbles. */}
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="radiogroup"
                  aria-label="Timer length"
                >
                  {DURATION_PRESETS.map((m) => {
                    const selected = presetMinutes === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPresetMinutes(m)}
                        className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors duration-200 ease-wl ${
                          selected
                            ? "border-transparent bg-ink text-surface shadow-xs"
                            : "border-strong bg-surface text-text2 hover:text-ink"
                        }`}
                      >
                        {m >= 60
                          ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}`
                          : `${m} min`}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={presetMinutes === "custom"}
                    onClick={() => setPresetMinutes("custom")}
                    className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors duration-200 ease-wl ${
                      presetMinutes === "custom"
                        ? "border-transparent bg-ink text-surface shadow-xs"
                        : "border-strong bg-surface text-text2 hover:text-ink"
                    }`}
                  >
                    Custom
                  </button>
                  {presetMinutes === "custom" && (
                    <span className="flex items-center gap-1.5 rounded-full border border-strong bg-surface py-1.5 pl-3 pr-3.5 animate-wl-rise">
                      <input
                        value={customMinutes}
                        onChange={(e) =>
                          setCustomMinutes(
                            e.target.value.replace(/[^0-9]/g, "").slice(0, 3)
                          )
                        }
                        inputMode="numeric"
                        aria-label="Custom length in minutes (1 to 480)"
                        className="w-10 bg-transparent text-right text-[13px] font-semibold text-ink outline-none tabular-nums"
                        autoFocus
                      />
                      <span className="text-[13px] text-text3">min</span>
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className="wl-lift mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-accentink px-5 py-[11px] text-sm font-bold shadow-sm"
                  style={{ color: "#fffefb" }}
                >
                  <Padlock size={15} locked />
                  Lock in · {resolvedMinutes} min
                </button>
              </div>
            </form>
          </div>

          <div className="flex flex-col rounded-[16px] border border-hairline bg-card p-6 shadow-sm">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-text3">
              Join
            </div>
            <div
              className="mb-4 text-[21px] font-bold text-ink"
              style={{ letterSpacing: "-0.02em" }}
            >
              Got a code?
            </div>
            <form onSubmit={joinByCode} className="mt-auto">
              <div className="flex gap-2">
                <input
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value);
                    setCodeError(false);
                  }}
                  placeholder="FOCUS-XXXXX"
                  maxLength={20}
                  aria-label="Room code"
                  aria-invalid={codeError}
                  className={`min-w-0 flex-1 rounded-[11px] border bg-surface px-3 py-2.5 text-sm font-semibold uppercase tracking-wider text-ink outline-none transition-colors duration-150 focus:border-accentink ${
                    codeError ? "border-danger" : "border-strong"
                  }`}
                />
                <button
                  type="submit"
                  aria-label="Join with code"
                  disabled={!codeInput.trim()}
                  className={`wl-lift flex w-[42px] min-w-[42px] items-center justify-center rounded-[11px] border ${
                    codeInput.trim()
                      ? "border-transparent bg-ink text-surface shadow-sm"
                      : "border-strong bg-surface text-faint"
                  }`}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
              {codeError && (
                <p className="mt-2 text-xs font-medium text-danger" role="alert">
                  That doesn&apos;t look like a room code.
                </p>
              )}
            </form>
          </div>
        </div>

        <div className="animate-wl-rise" style={{ animationDelay: ".1s" }}>
          <div className="mb-3.5 flex items-center justify-between">
            <h2
              className="text-base font-bold text-ink"
              style={{ letterSpacing: "-0.02em" }}
            >
              Live rooms
            </h2>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-text2">
              <span
                className="h-[7px] w-[7px] rounded-full animate-wl-live"
                style={{ background: "#54a078" }}
                aria-hidden="true"
              />
              {liveCount} studying now
            </span>
          </div>

          {rooms.length === 0 ? (
            <div className="rounded-[14px] border border-hairline bg-card px-5 py-8 text-center text-sm text-text3">
              No live rooms right now. Start yours.
            </div>
          ) : (
            <ul className="flex list-none flex-col gap-2.5 p-0">
              {rooms.map((r) => {
                const remaining = r.durationSec - (now - r.startedAt) / 1000;
                return (
                  <li
                    key={r.id}
                    className="wl-lift flex items-center gap-4 rounded-[14px] border border-hairline bg-surface p-3.5 px-4 shadow-xs max-[560px]:flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold text-ink">
                          {r.name}
                        </span>
                        {r.deep && (
                          <span className="whitespace-nowrap rounded-full border border-hairline bg-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.06em] text-text2">
                            Deep Focus
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold text-text2 tabular-nums">
                          {remaining > 0
                            ? `Focus ${formatClock(remaining)}`
                            : "Done"}
                        </span>
                        {r.subject && (
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-text3">
                            {r.subject}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3.5 max-[560px]:w-full max-[560px]:justify-between">
                      <div className="flex items-center">
                        {r.peerNames.map((name, i) => (
                          <span key={`${name}-${i}`} className="-ml-2 first:ml-0">
                            <Avatar
                              username={name}
                              size={30}
                              rounded="50%"
                              fontSize={11}
                              ringColor="var(--wl-surface)"
                            />
                          </span>
                        ))}
                        <span className="ml-2 text-[13px] font-semibold text-text2 tabular-nums">
                          {r.peerCount}
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          router.push(`/room/${encodeURIComponent(r.id)}`)
                        }
                        className="rounded-full border border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition-colors duration-200 ease-wl hover:bg-ink hover:text-surface"
                      >
                        Join
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
