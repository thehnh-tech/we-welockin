"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPseudo, setPseudo } from "@/lib/cookies";
import { normalizeRoomCode } from "@/lib/roomCode";
import { formatShortDuration } from "@/lib/time";
import { getStreakDays, getTodaySeconds, getWeekSeconds } from "@/lib/stats";
import { ROOMS_POLL_MS } from "@/lib/constants";
import { usePrefs } from "@/lib/prefs";
import { useNow } from "@/lib/useNow";
import { useVerified } from "@/lib/useVerified";
import { ROOM_CAPACITY } from "@/lib/store/sanitize";
import Avatar from "@/components/Avatar";
import Padlock from "@/components/Padlock";
import SettingsMenu from "@/components/SettingsMenu";
import VerifyUniversity, { type VerifiedInfo } from "@/components/VerifyUniversity";
import FeedRoomCard, { type FeedRoom } from "@/components/FeedRoomCard";
import BlockerBanner from "@/components/BlockerBanner";
import { handleKeyDown, tabIndexFor } from "@/components/radioPills";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Pill values in DOM order — the radiogroup keyboard helper maps arrow keys
// onto this list.
const DURATION_VALUES = [25, 50, 90, "custom"] as const; // minutes
const VISIBILITY_VALUES = ["private", "public"] as const;
const MAX_MINUTES = 480;

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default function HomeView() {
  const router = useRouter();
  const prefs = usePrefs();
  // Ticking clock for the feed cards' "min left" (render purity: no
  // Date.now() during render).
  const now = useNow(15_000);
  const [pseudo, setPseudoState] = useState<string | null>(null);
  const [pseudoInput, setPseudoInput] = useState("");
  // University verification (signed httpOnly cookie, read via the API).
  const [verify, setVerify] = useVerified(!!pseudo);
  // Marketing floor — the counter never looks empty (see /api/rooms).
  const [activeUsers, setActiveUsers] = useState(130);
  const [feedRooms, setFeedRooms] = useState<FeedRoom[]>([]);
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [presetMinutes, setPresetMinutes] = useState<number | "custom">(25);
  const [customMinutes, setCustomMinutes] = useState("45");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  // Set when "Custom" is activated by click/Enter, so the minutes field takes
  // focus on mount — but never when arrowing across the pills.
  const focusCustomRef = useRef(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [stats, setStats] = useState({ today: 0, week: 0, streak: 0 });
  const [greeting, setGreeting] = useState("");

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

  useEffect(() => {
    if (!pseudo) return;
    let alive = true;
    // Polls overlap on a slow connection, and responses can land out of
    // order. Applying only the newest one keeps a stale payload from making a
    // live room flicker away (or the counter jump backwards) for a tick.
    let issued = 0;
    let applied = 0;
    const fetchFeed = async () => {
      if (document.visibilityState === "hidden") return;
      const seq = ++issued;
      try {
        const res = await fetch("/api/rooms", { cache: "no-store" });
        const data = await res.json();
        if (!alive || seq <= applied) return;
        applied = seq;
        if (typeof data.activeUsers === "number") {
          setActiveUsers(data.activeUsers);
        }
        if (Array.isArray(data.rooms)) setFeedRooms(data.rooms);
      } catch {}
    };
    fetchFeed();
    const t = setInterval(fetchFeed, ROOMS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pseudo]);


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

  // Both kinds of room are created by the server, which mints the id. Nothing
  // about a room — its name, timer, visibility — is ever carried in the link,
  // so a link cannot describe a room into existence or misdescribe one.
  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (publishing) return;
    if (visibility === "public" && !verify.verified) return;

    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim() || "Study session",
          subject: newSubject.trim(),
          durationSec: Math.max(60, Math.min(8 * 3600, resolvedMinutes * 60)),
          visibility,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.room) {
        if (res.status === 401) {
          setVerify({
            loaded: true,
            verified: false,
            institution: "",
            domain: "",
          });
          setPublishError("Your verification expired — verify again below.");
        } else if (res.status === 429) {
          setPublishError("You've started a lot of rooms — try again later.");
        } else {
          setPublishError("Couldn't create the room. Try again.");
        }
        return;
      }
      router.push(`/room/${encodeURIComponent(data.room.id)}`);
    } catch {
      setPublishError("Network error — try again.");
    } finally {
      setPublishing(false);
    }
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
          <p className="mb-3 text-[15px] text-bandtext2">
            Start a room or join your crew with a code.
          </p>
          <div className="mb-8 flex items-center gap-2 text-[13px] font-semibold text-bandtext2">
            <span
              className="h-[7px] w-[7px] rounded-full animate-wl-live"
              style={{ background: "#54a078" }}
              aria-hidden="true"
            />
            <span className="tabular-nums">{activeUsers}</span> people locked
            in right now
          </div>

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
                    number-input validation bubbles. The radiogroup wraps the
                    radios ONLY; the custom-minutes field sits beside it. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="radiogroup"
                    aria-label="Timer length"
                  >
                    {DURATION_VALUES.map((m) => {
                      const selected = presetMinutes === m;
                      return (
                        <button
                          key={String(m)}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          tabIndex={tabIndexFor(m, presetMinutes)}
                          onKeyDown={(e) =>
                            handleKeyDown(
                              e,
                              DURATION_VALUES,
                              presetMinutes,
                              setPresetMinutes
                            )
                          }
                          onClick={() => {
                            // Activating "Custom" outright (click / Enter)
                            // drops the caret in the minutes field; arrowing
                            // ONTO it must not, or focus leaves the group and
                            // further arrow keys stop working.
                            if (m === "custom") focusCustomRef.current = true;
                            setPresetMinutes(m);
                          }}
                          className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors duration-200 ease-wl ${
                            selected
                              ? "border-transparent bg-ink text-surface shadow-xs"
                              : "border-strong bg-surface text-text2 hover:text-ink"
                          }`}
                        >
                          {m === "custom"
                            ? "Custom"
                            : m >= 60
                              ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}`
                              : `${m} min`}
                        </button>
                      );
                    })}
                  </div>
                  {presetMinutes === "custom" && (
                    <span className="flex items-center gap-1.5 rounded-full border border-strong bg-surface py-1.5 pl-3 pr-3.5 animate-wl-rise">
                      <input
                        ref={(el) => {
                          if (el && focusCustomRef.current) {
                            focusCustomRef.current = false;
                            el.focus();
                          }
                        }}
                        value={customMinutes}
                        onChange={(e) =>
                          setCustomMinutes(
                            e.target.value.replace(/[^0-9]/g, "").slice(0, 3)
                          )
                        }
                        inputMode="numeric"
                        aria-label="Custom length in minutes (1 to 480)"
                        className="w-10 bg-transparent text-right text-[13px] font-semibold text-ink outline-none tabular-nums"
                      />
                      <span className="text-[13px] text-text3">min</span>
                    </span>
                  )}
                </div>

                {/* Visibility — private by default; putting a room on the
                    public feed requires a verified university email. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="radiogroup"
                    aria-label="Room visibility"
                  >
                    {VISIBILITY_VALUES.map((v) => {
                      const selected = visibility === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          tabIndex={tabIndexFor(v, visibility)}
                          onKeyDown={(e) =>
                            handleKeyDown(
                              e,
                              VISIBILITY_VALUES,
                              visibility,
                              (next) => {
                                setVisibility(next);
                                setPublishError(null);
                              }
                            )
                          }
                          onClick={() => {
                            setVisibility(v);
                            setPublishError(null);
                          }}
                          className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors duration-200 ease-wl ${
                            selected
                              ? "border-transparent bg-ink text-surface shadow-xs"
                              : "border-strong bg-surface text-text2 hover:text-ink"
                          }`}
                        >
                          {v === "private" ? "Private" : "Public feed"}
                        </button>
                      );
                    })}
                  </div>
                  {verify.verified && (
                    <span
                      className="flex items-center gap-1 rounded-full bg-accenttint px-2.5 py-1.5 text-[11px] font-bold text-accentink"
                      title={verify.institution}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Verified student
                    </span>
                  )}
                </div>

                {visibility === "private" ? (
                  <p className="text-xs text-text3">
                    Your room is private and seats {ROOM_CAPACITY}. Share the
                    invite code once you&apos;re in.
                  </p>
                ) : verify.verified ? (
                  <p className="text-xs text-text3">
                    Your room seats {ROOM_CAPACITY} and will appear on the
                    public feed for{" "}
                    <span className="font-semibold text-text2">
                      {verify.institution}
                    </span>
                    . Only verified students can join it.
                  </p>
                ) : verify.loaded ? (
                  <VerifyUniversity
                    onVerified={(v: VerifiedInfo) =>
                      setVerify({
                        loaded: true,
                        verified: true,
                        institution: v.institution,
                        domain: v.domain,
                      })
                    }
                  />
                ) : (
                  <p className="text-xs text-text3">
                    Checking your verification…
                  </p>
                )}

                {publishError && (
                  <p className="text-xs font-medium text-danger" role="alert">
                    {publishError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={
                    publishing || (visibility === "public" && !verify.verified)
                  }
                  className="wl-lift mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-accentink px-5 py-[11px] text-sm font-bold shadow-sm disabled:bg-track disabled:text-faint disabled:shadow-none"
                  style={
                    publishing || (visibility === "public" && !verify.verified)
                      ? undefined
                      : { color: "#fffefb" }
                  }
                >
                  <Padlock size={15} locked />
                  {publishing
                    ? "Creating…"
                    : `Lock in · ${resolvedMinutes} min`}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-[16px] border border-hairline bg-card p-6 shadow-sm">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-text3">
              Join
            </div>
            <div
              className="mb-3 text-[21px] font-bold text-ink"
              style={{ letterSpacing: "-0.02em" }}
            >
              Got a code?
            </div>
            <form onSubmit={joinByCode}>
              <div className="flex gap-2">
                <input
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value);
                    setCodeError(false);
                  }}
                  placeholder="7Q2XKM"
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
              {codeError ? (
                <p className="mt-2 text-xs font-medium text-danger" role="alert">
                  That doesn&apos;t look like a room code.
                </p>
              ) : (
                <p className="mt-2 text-xs text-text3">
                  Six characters, like 7Q2XKM — ask your crew for theirs.
                </p>
              )}
            </form>
          </div>
        </div>

        {/* ---- Public feed ---- */}
        <section
          className="mb-9 animate-wl-rise"
          style={{ animationDelay: ".08s" }}
          aria-label="Public rooms feed"
        >
          <div className="mb-3.5 flex items-end justify-between">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-text3">
                Public feed
              </div>
              <h2
                className="text-[21px] font-bold text-ink"
                style={{ letterSpacing: "-0.02em" }}
              >
                Live study rooms
              </h2>
            </div>
            {feedRooms.length > 0 && (
              <span className="flex items-center gap-1.5 pb-1 text-[13px] font-semibold text-text2">
                <span
                  className="h-[7px] w-[7px] rounded-full animate-wl-live"
                  style={{ background: "#54a078" }}
                  aria-hidden="true"
                />
                <span className="tabular-nums">{feedRooms.length}</span> live
              </span>
            )}
          </div>

          {feedRooms.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-strong bg-card px-6 py-9 text-center">
              <p className="text-sm font-semibold text-text2">
                No public rooms right now.
              </p>
              <p className="mt-1 text-xs text-text3">
                {verify.verified
                  ? "Start one above — switch your room to Public feed."
                  : "Switch your new room to Public feed above to verify your university email and start the first one."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 max-[720px]:grid-cols-1">
              {feedRooms.map((r) => (
                <FeedRoomCard
                  key={r.id}
                  room={r}
                  now={now}
                  onJoin={(id) =>
                    router.push(`/room/${encodeURIComponent(id)}`)
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Bottom bar, pinned to the viewport: the feed can run long, and
            the blocker stays offered however far down someone has scrolled. */}
        <BlockerBanner variant="banner" />
      </main>
    </div>
  );
}
