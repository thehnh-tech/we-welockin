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

const DAYS_FR = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

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
  const [newMinutes, setNewMinutes] = useState(25);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [stats, setStats] = useState({ today: 0, week: 0, streak: 0 });
  const [greeting, setGreeting] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setPseudoState(getPseudo());
    const d = new Date();
    setGreeting(`${DAYS_FR[d.getDay()]} · semaine ${isoWeek(d)}`);
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
    // Guard against an empty/NaN minutes field (would propagate ?d=NaN).
    const minutes =
      Number.isFinite(newMinutes) && newMinutes > 0 ? Math.floor(newMinutes) : 25;
    const durationSec = Math.max(60, Math.min(8 * 3600, minutes * 60));
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
              Hey, prêt à lock in ?
            </h1>
            <p className="mt-1 text-sm text-text2">
              Choisis un pseudo pour rejoindre ton crew.
            </p>
          </div>
          <input
            autoFocus
            value={pseudoInput}
            onChange={(e) => setPseudoInput(e.target.value)}
            placeholder="Ton pseudo"
            maxLength={30}
            aria-label="Pseudo"
            className="w-full rounded-[11px] border border-strong bg-surface px-3.5 py-2.5 text-ink outline-none transition-colors duration-150 focus:border-accentink"
          />
          <button
            type="submit"
            disabled={!pseudoInput.trim()}
            className="wl-lift w-full rounded-full bg-accent py-2.5 text-sm font-bold text-ink shadow-sm disabled:bg-track disabled:text-faint"
          >
            Lock in
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen pb-16 text-ink">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline px-7 py-4 backdrop-blur-md"
        style={{ background: "rgba(239,234,224,.88)" }}
      >
        <div className="flex items-center gap-2 text-ink">
          <Padlock size={22} />
          <span className="text-[15px] font-bold tracking-tight">
            welock<span className="text-accentink">.in</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center gap-[7px] rounded-full border border-hairline bg-surface px-3 py-[7px] shadow-xs"
            title="Jours de focus consécutifs"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3a352d"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
            </svg>
            <span className="text-[13px] font-bold text-ink tabular-nums">
              {stats.streak}
            </span>
            <span className="text-xs font-medium text-text3">
              {stats.streak > 1 ? "jours de suite" : "jour de suite"}
            </span>
          </div>
          <SettingsMenu pseudo={pseudo} onPseudoChange={setPseudoState} />
          <Avatar
            username={pseudo}
            tintKey={prefs.tint}
            size={34}
            rounded="11px"
          />
        </div>
      </header>

      <main className="mx-auto max-w-[980px] px-7 pt-10">
        <div className="animate-wl-rise">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-text2">
            {greeting}
          </div>
          <h1
            className="mb-1 text-3xl font-bold text-ink"
            style={{ letterSpacing: "-0.02em" }}
          >
            Hey {pseudo}, lock in
          </h1>
          <p className="mb-7 text-[15px] text-text2">
            Lance une room ou rejoins un crew qui étudie déjà.
          </p>
        </div>

        <div
          className="wl-hero mb-8 grid grid-cols-[1.4fr_1fr] gap-3.5 max-[720px]:grid-cols-1 animate-wl-rise"
          style={{ animationDelay: ".04s" }}
        >
          <div className="rounded-[16px] border border-hairline bg-surface p-6 shadow-sm">
            <form onSubmit={createRoom}>
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-text3">
                Nouvelle room
              </div>
              <div
                className="mb-4 text-[21px] font-bold text-ink"
                style={{ letterSpacing: "-0.02em" }}
              >
                Lance une focus room
              </div>
              <div className="flex flex-col gap-2.5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nom (ex : Révisions orga chimie)"
                  maxLength={60}
                  aria-label="Nom de la room"
                  className="w-full rounded-[11px] border border-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors duration-150 focus:border-accentink"
                />
                <div className="flex gap-2.5 max-[560px]:flex-col">
                  <input
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="Sujet (optionnel)"
                    maxLength={60}
                    aria-label="Sujet"
                    className="min-w-0 flex-1 rounded-[11px] border border-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors duration-150 focus:border-accentink"
                  />
                  <div className="flex items-center gap-2 rounded-[11px] border border-strong bg-surface px-3 py-2.5">
                    <span className="text-sm text-text3">Timer</span>
                    <input
                      type="number"
                      min={1}
                      max={480}
                      value={newMinutes}
                      onChange={(e) => setNewMinutes(Number(e.target.value))}
                      aria-label="Durée du timer en minutes"
                      className="w-16 bg-transparent text-right text-sm text-ink outline-none tabular-nums"
                    />
                    <span className="text-sm text-text3">min</span>
                  </div>
                </div>
                <button
                  type="submit"
                  className="wl-lift mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-accent px-5 py-[11px] text-sm font-bold text-ink shadow-sm"
                >
                  <Padlock size={15} locked />
                  Lock in
                </button>
              </div>
            </form>
          </div>

          <div className="flex flex-col rounded-[16px] border border-hairline bg-card p-6 shadow-xs">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-text3">
              Rejoindre
            </div>
            <div
              className="mb-4 text-[21px] font-bold text-ink"
              style={{ letterSpacing: "-0.02em" }}
            >
              Tu as un code ?
            </div>
            <form onSubmit={joinByCode} className="mt-auto">
              <div className="flex gap-2">
                <input
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value);
                    setCodeError(false);
                  }}
                  placeholder="FOCUS-00000"
                  maxLength={20}
                  aria-label="Code de la room"
                  aria-invalid={codeError}
                  className={`min-w-0 flex-1 rounded-[11px] border bg-surface px-3 py-2.5 text-sm font-semibold uppercase tracking-wider text-ink outline-none transition-colors duration-150 focus:border-accentink ${
                    codeError ? "border-danger" : "border-strong"
                  }`}
                />
                <button
                  type="submit"
                  aria-label="Rejoindre avec le code"
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
                  Ce code ne ressemble pas à un code de room.
                </p>
              )}
            </form>
          </div>
        </div>

        <div
          className="wl-stats mb-9 grid grid-cols-3 gap-3.5 max-[560px]:grid-cols-1 animate-wl-rise"
          style={{ animationDelay: ".08s" }}
        >
          <div className="rounded-[14px] border border-hairline bg-card px-5 py-[18px] shadow-xs">
            <div
              className="text-2xl font-bold text-ink tabular-nums"
              style={{ letterSpacing: "-0.02em" }}
            >
              {formatShortDuration(stats.today)}
            </div>
            <div className="mt-1 text-[13px] text-text3">
              Focus aujourd&apos;hui
            </div>
          </div>
          <div className="rounded-[14px] border border-hairline bg-card px-5 py-[18px] shadow-xs">
            <div
              className="text-2xl font-bold text-ink tabular-nums"
              style={{ letterSpacing: "-0.02em" }}
            >
              {stats.streak}
            </div>
            <div className="mt-1 text-[13px] text-text3">
              {stats.streak > 1 ? "Jours de suite" : "Jour de suite"}
            </div>
          </div>
          <div className="rounded-[14px] border border-hairline bg-card px-5 py-[18px] shadow-xs">
            <div
              className="text-2xl font-bold text-ink tabular-nums"
              style={{ letterSpacing: "-0.02em" }}
            >
              {stats.week >= 3600
                ? `${Math.round(stats.week / 3600)}h`
                : formatShortDuration(stats.week)}
            </div>
            <div className="mt-1 text-[13px] text-text3">Cette semaine</div>
          </div>
        </div>

        <div
          className="animate-wl-rise"
          style={{ animationDelay: ".12s" }}
        >
          <div className="mb-3.5 flex items-center justify-between">
            <h2
              className="text-base font-bold text-ink"
              style={{ letterSpacing: "-0.02em" }}
            >
              Rooms en direct
            </h2>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-text2">
              <span
                className="h-[7px] w-[7px] rounded-full animate-wl-live"
                style={{ background: "#54a078" }}
                aria-hidden="true"
              />
              {liveCount} en train d&apos;étudier
            </span>
          </div>

          {rooms.length === 0 ? (
            <div className="rounded-[14px] border border-hairline bg-card px-5 py-8 text-center text-sm text-text3">
              Aucune room active pour l&apos;instant. Lance la tienne.
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
                            : "Terminé"}
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
                              ringColor="#fffefb"
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
                        className="rounded-full border border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition-colors duration-150 hover:bg-ink hover:text-surface"
                      >
                        Rejoindre
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
