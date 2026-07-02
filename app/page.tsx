"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getPseudo, setPseudo, clearPseudo } from "@/lib/cookies";
import { buildRoomUrl } from "@/lib/roomLink";
import { generateRoomId, normalizeRoomCode } from "@/lib/roomCode";
import { avatarColor, initials } from "@/lib/avatar";
import { formatClock, formatHours } from "@/lib/time";
import { getStreakDays, getTodaySeconds, getWeekSeconds } from "@/lib/stats";
import { ROOMS_POLL_MS } from "@/lib/constants";

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
  "DIMANCHE",
  "LUNDI",
  "MARDI",
  "MERCREDI",
  "JEUDI",
  "VENDREDI",
  "SAMEDI",
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
    setGreeting(`${DAYS_FR[d.getDay()]} · SEMAINE ${isoWeek(d)}`);
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
          className="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-panel p-7 shadow-xl"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-accent text-[15px] font-extrabold">
              W
            </div>
            <span className="text-[15px] font-extrabold tracking-wide">
              WeLockIn
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Prêt à lock in ?
            </h1>
            <p className="mt-1 text-sm font-medium text-zinc-500">
              Choisis un pseudo pour commencer.
            </p>
          </div>
          <input
            autoFocus
            value={pseudoInput}
            onChange={(e) => setPseudoInput(e.target.value)}
            placeholder="Ton pseudo"
            maxLength={30}
            aria-label="Pseudo"
            className="w-full rounded-xl border border-line2 bg-bg px-3.5 py-2.5 text-zinc-200 outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!pseudoInput.trim()}
            className="w-full rounded-xl bg-accent py-2.5 text-sm font-bold hover:brightness-110"
          >
            Continuer
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen pb-16 text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/85 px-7 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-accent text-[15px] font-extrabold">
            W
          </div>
          <span className="text-[15px] font-extrabold tracking-wide">
            WeLockIn
          </span>
        </div>
        <div className="flex items-center gap-3.5">
          <div
            className="flex items-center gap-[7px] rounded-[10px] border border-line2 bg-panel px-3 py-[7px]"
            title="Jours de focus consécutifs"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="#6366f1"
              aria-hidden="true"
            >
              <path d="M12 2c1 4 4 5 4 9a4 4 0 01-8 0c0-1 .5-2 1-2.5C9 11 9 13 11 13c0-2-1-3-1-5 0-3 1-5 2-6z" />
            </svg>
            <span className="font-mono text-[13px] font-semibold text-zinc-200">
              {stats.streak}
            </span>
            <span className="text-xs font-medium text-zinc-500">
              {stats.streak > 1 ? "jours de suite" : "jour de suite"}
            </span>
          </div>
          <button
            onClick={() => {
              clearPseudo();
              setPseudoState(null);
            }}
            title={`${pseudo} — changer de pseudo`}
            aria-label={`Connecté en tant que ${pseudo}. Changer de pseudo`}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] text-[13px] font-bold text-white hover:brightness-110"
            style={{ background: avatarColor(pseudo) }}
          >
            {initials(pseudo)}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[980px] px-7 pt-10">
        <div className="mb-2 text-[13px] font-bold tracking-wider text-indigo-400">
          {greeting}
        </div>
        <h1 className="mb-1 text-3xl font-extrabold tracking-tight">
          Prêt à lock in, {pseudo} ?
        </h1>
        <p className="mb-7 text-sm font-medium text-zinc-500">
          Lance une room ou rejoins un crew qui étudie déjà.
        </p>

        <div className="wl-hero mb-8 grid grid-cols-[1.4fr_1fr] gap-3.5 max-[720px]:grid-cols-1">
          <div className="relative overflow-hidden rounded-2xl border border-line2 bg-panel p-6">
            <span
              className="absolute -right-5 -top-8 h-[140px] w-[140px] rounded-full bg-accent blur-[50px] animate-wl-breathe"
              aria-hidden="true"
            />
            <form onSubmit={createRoom} className="relative">
              <div className="mb-2.5 text-xs font-bold uppercase tracking-[.12em] text-indigo-400">
                Nouvelle room
              </div>
              <div className="mb-4 text-lg font-bold">Lance une focus room</div>
              <div className="flex flex-col gap-2.5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nom (ex : Révisions orga chimie)"
                  maxLength={60}
                  aria-label="Nom de la room"
                  className="w-full rounded-[10px] border border-line2 bg-bg px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-accent"
                />
                <div className="flex gap-2.5 max-[560px]:flex-col">
                  <input
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="Sujet (optionnel)"
                    maxLength={60}
                    aria-label="Sujet"
                    className="min-w-0 flex-1 rounded-[10px] border border-line2 bg-bg px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-accent"
                  />
                  <div className="flex items-center gap-2 rounded-[10px] border border-line2 bg-bg px-3 py-2.5">
                    <span className="text-sm text-zinc-500">Timer</span>
                    <input
                      type="number"
                      min={1}
                      max={480}
                      value={newMinutes}
                      onChange={(e) => setNewMinutes(Number(e.target.value))}
                      aria-label="Durée du timer en minutes"
                      className="w-16 bg-transparent text-right font-mono text-sm outline-none"
                    />
                    <span className="text-sm text-zinc-500">min</span>
                  </div>
                </div>
                <button
                  type="submit"
                  className="mt-1 inline-flex w-fit items-center gap-2 rounded-[11px] bg-accent px-[18px] py-[11px] text-sm font-bold hover:brightness-110"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Créer &amp; rejoindre
                </button>
              </div>
            </form>
          </div>

          <div className="flex flex-col rounded-2xl border border-line2 bg-panel p-6">
            <div className="mb-2.5 text-xs font-bold uppercase tracking-[.12em] text-zinc-500">
              Rejoindre
            </div>
            <div className="mb-4 text-lg font-bold">Tu as un code ?</div>
            <form onSubmit={joinByCode} className="mt-auto">
              <div className="flex gap-2">
                <input
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value);
                    setCodeError(false);
                  }}
                  placeholder="FOCUS-0000"
                  maxLength={20}
                  aria-label="Code de la room"
                  aria-invalid={codeError}
                  className={`min-w-0 flex-1 rounded-[10px] border bg-bg px-3 py-2.5 font-mono text-sm font-semibold uppercase tracking-wider text-zinc-200 outline-none focus:border-accent ${
                    codeError ? "border-red-400" : "border-line2"
                  }`}
                />
                <button
                  type="submit"
                  aria-label="Rejoindre avec le code"
                  disabled={!codeInput.trim()}
                  className={`flex w-[42px] min-w-[42px] items-center justify-center rounded-[10px] border ${
                    codeInput.trim()
                      ? "border-accent bg-accent text-white"
                      : "border-line2 bg-bg text-zinc-500"
                  }`}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
              {codeError && (
                <p className="mt-2 text-xs font-medium text-red-400" role="alert">
                  Ce code ne ressemble pas à un code de room.
                </p>
              )}
            </form>
          </div>
        </div>

        <div className="wl-stats mb-9 grid grid-cols-3 gap-3.5 max-[560px]:grid-cols-1">
          <div className="rounded-2xl border border-line bg-panel px-5 py-[18px]">
            <div className="font-mono text-2xl font-bold tracking-tight text-white">
              {formatHours(stats.today)}
            </div>
            <div className="mt-1 text-xs font-semibold text-zinc-500">
              Focus aujourd&apos;hui (h)
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-panel px-5 py-[18px]">
            <div className="font-mono text-2xl font-bold tracking-tight text-accent">
              {stats.streak}
            </div>
            <div className="mt-1 text-xs font-semibold text-zinc-500">
              Jours de suite
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-panel px-5 py-[18px]">
            <div className="font-mono text-2xl font-bold tracking-tight text-white">
              {formatHours(stats.week)}h
            </div>
            <div className="mt-1 text-xs font-semibold text-zinc-500">
              Cette semaine
            </div>
          </div>
        </div>

        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-base font-bold">Rooms en direct</h2>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
            <span
              className="h-[7px] w-[7px] rounded-full bg-green-500 animate-wl-live"
              aria-hidden="true"
            />
            {liveCount} en train d&apos;étudier
          </span>
        </div>

        {rooms.length === 0 ? (
          <div className="rounded-2xl border border-line bg-panel px-5 py-8 text-center text-sm font-medium text-zinc-500">
            Aucune room active pour l&apos;instant. Lance la tienne !
          </div>
        ) : (
          <ul className="flex list-none flex-col gap-2.5 p-0">
            {rooms.map((r) => {
              const remaining = r.durationSec - (now - r.startedAt) / 1000;
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-4 rounded-2xl border bg-panel p-3.5 px-4 max-[560px]:flex-wrap ${
                    r.deep ? "border-indigo-500/30" : "border-line"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-bold text-white">
                        {r.name}
                      </span>
                      {r.deep && (
                        <span className="whitespace-nowrap rounded-md border border-indigo-500/40 bg-indigo-500/15 px-[7px] py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-200">
                          Deep Focus
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-semibold text-accent">
                        {remaining > 0
                          ? `Focus ${formatClock(remaining)}`
                          : "Terminé"}
                      </span>
                      {r.subject && (
                        <>
                          <span className="text-xs text-zinc-600">·</span>
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-zinc-500">
                            {r.subject}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3.5 max-[560px]:w-full max-[560px]:justify-between">
                    <div className="flex items-center">
                      {r.peerNames.map((name, i) => (
                        <div
                          key={`${name}-${i}`}
                          className="-ml-2 flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-panel text-[11px] font-bold text-white first:ml-0"
                          style={{ background: avatarColor(name) }}
                          title={name}
                        >
                          {initials(name)}
                        </div>
                      ))}
                      <span className="ml-2 text-[13px] font-semibold text-zinc-400">
                        {r.peerCount}
                      </span>
                    </div>
                    <button
                      onClick={() => router.push(`/room/${encodeURIComponent(r.id)}`)}
                      className="rounded-[10px] border border-zinc-700 px-4 py-2 text-[13px] font-bold text-zinc-200 hover:border-accent hover:bg-indigo-500/10 hover:text-white"
                    >
                      Rejoindre
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
