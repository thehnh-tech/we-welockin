"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { getPseudo } from "@/lib/cookies";
import { displayRoomCode } from "@/lib/roomCode";
import { usePrefs } from "@/lib/prefs";
import { useVerified } from "@/lib/useVerified";
import { ROOM_CAPACITY } from "@/lib/store/sanitize";
import VideoTile from "@/components/VideoTile";
import Timer from "@/components/Timer";
import CrewSidebar from "@/components/CrewSidebar";
import SettingsMenu from "@/components/SettingsMenu";
import Padlock from "@/components/Padlock";
import VerifyUniversity from "@/components/VerifyUniversity";
import { useRoomMeta } from "./hooks/useRoomMeta";
import { useLocalMedia } from "./hooks/useLocalMedia";
import { usePeerMesh, type PeerStatus } from "./hooks/usePeerMesh";
import { useAway } from "./hooks/useAway";
import { useSpeaking } from "./hooks/useSpeaking";
import { useFocusRecorder } from "./hooks/useFocusRecorder";
import { useDeviceGuard } from "./hooks/useDeviceGuard";

export default function RoomPage() {
  return (
    <Suspense fallback={null}>
      <RoomInner />
    </Suspense>
  );
}

// Pill control — charte §07: at rest surface + hairline; engaged = ink fill.
function ControlPill({
  onClick,
  disabled = false,
  pressed,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  pressed: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold ${
        disabled
          ? "border-hairline bg-card text-faint"
          : pressed
            ? "wl-lift border-transparent bg-ink text-surface shadow-sm"
            : "wl-lift border-strong bg-surface text-ink2 shadow-xs hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function RoomInner() {
  const params = useParams<{ id: string }>();
  const roomId = params.id;
  const router = useRouter();

  const [pseudo, setPseudoState] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deep, setDeep] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobOpen, setMobOpen] = useState(false);
  const prefs = usePrefs();

  // Read pseudo (bounce home if absent).
  useEffect(() => {
    const p = getPseudo();
    if (!p) {
      router.replace("/");
      return;
    }
    setPseudoState(p);
  }, [router]);

  const { room, roomError } = useRoomMeta(roomId);

  // One live session per device: probe other tabs before touching the camera.
  const { ready: deviceReady, blocked } = useDeviceGuard(roomId);

  // A public room is open to the whole feed, so the university check guards
  // joining it, not just creating it. This is the UI half; the server refuses
  // the announce regardless of what the client believes.
  const [verify, setVerify] = useVerified(!!pseudo);
  const needsVerification =
    room?.visibility === "public" && verify.loaded && !verify.verified;

  const { localStream, mediaError, muted, camOff, toggleMute, toggleCam } =
    useLocalMedia(
      !!pseudo && !!room && deviceReady && !blocked && !needsVerification
    );

  const away = useAway();
  const effectiveMuted = muted || deep;

  // Deep Focus force-mutes the mic on top of the user's own mute choice; the
  // mic button is disabled while deep, so this effect owns the combined state.
  useEffect(() => {
    if (!localStream) return;
    for (const t of localStream.getAudioTracks()) {
      t.enabled = !effectiveMuted;
    }
  }, [localStream, effectiveMuted]);

  // Live status, read by the mesh at each heartbeat (updated in the effect
  // below so the mesh never needs to re-run on a status change).
  const statusRef = useRef<PeerStatus>({
    muted: false,
    away: false,
    deep: false,
    tint: "",
  });

  const {
    connected,
    myPeerId,
    remotes,
    roster,
    banner,
    blockedReason,
    dismissWarning,
    refreshStatus,
  } = usePeerMesh({ roomId, pseudo, room, localStream, statusRef });

  // Push status changes immediately instead of waiting for the heartbeat.
  useEffect(() => {
    statusRef.current = { muted: effectiveMuted, away, deep, tint: prefs.tint };
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMuted, away, deep, prefs.tint]);

  useFocusRecorder(connected);

  // Voice activity: local stream under the "self" key + every remote.
  const speakingStreams = useMemo(() => {
    const m = new Map<string, MediaStream>();
    if (localStream) m.set("self", localStream);
    for (const [peerId, info] of remotes) m.set(peerId, info.stream);
    return m;
  }, [localStream, remotes]);
  const speaking = useSpeaking(speakingStreams, !deep);

  // Focus mode = fullscreen + collapsed sidebar + compact grid.
  const toggleFocus = () => {
    const entering = !focusMode;
    setFocusMode(entering);
    setCollapsed(entering);
    setMobOpen(false);
    try {
      if (entering) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch {}
  };
  // Leaving fullscreen via Esc exits focus mode too — and restores the
  // sidebar, exactly like the button path does.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setFocusMode((was) => {
          if (was) setCollapsed(false);
          return false;
        });
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const leave = () => {
    router.push("/");
  };

  const copyLink = async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for non-secure contexts (e.g. LAN over HTTP) where the
        // async Clipboard API is unavailable.
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const rosterById = useMemo(() => {
    const m = new Map(roster.map((p) => [p.peerId, p]));
    return m;
  }, [roster]);
  const remotesList = useMemo(() => Array.from(remotes.entries()), [remotes]);

  if (blocked) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-[20px] border border-hairline bg-surface p-8 text-center shadow-md animate-wl-rise">
          <p className="mb-2 text-[17px] font-bold text-ink">
            One session per device
          </p>
          <p className="mb-5 text-sm text-text2">
            You&apos;re already locked in from another tab. Use that one, or
            close it and reload here.
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="wl-lift rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface"
            >
              Reload
            </button>
            <button
              onClick={() => router.push("/")}
              className="wl-lift rounded-full border border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink2"
            >
              Home
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Public room, unverified visitor: offer the check right here rather than
  // bouncing them home and making them find their way back. The mesh's own
  // 403 lands here too, so a cookie that expires mid-session reopens the gate
  // instead of silently dropping presence.
  if (needsVerification || blockedReason === "verification") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-[20px] border border-hairline bg-surface p-7 shadow-modal animate-wl-rise">
          <div className="flex items-center gap-2 text-ink">
            <Padlock size={22} locked />
            <span className="text-[15px] font-bold tracking-tight">
              welock<span className="text-accentink">.in</span>
            </span>
          </div>
          <div>
            <h1
              className="text-[22px] font-bold text-ink"
              style={{ letterSpacing: "-0.02em" }}
            >
              {room?.name ? `"${room.name}" is a public room` : "Public room"}
            </h1>
            <p className="mt-1 text-sm text-text2">
              Public rooms are students only. Verify your university email
              once, and you can join any of them.
            </p>
          </div>
          <VerifyUniversity
            onVerified={(v) =>
              setVerify({
                loaded: true,
                verified: true,
                institution: v.institution,
              })
            }
          />
          <button
            onClick={() => router.push("/")}
            className="wl-lift w-full rounded-full border border-strong bg-surface py-2.5 text-sm font-semibold text-ink2"
          >
            Back home
          </button>
        </div>
      </main>
    );
  }

  if (blockedReason === "full") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-[20px] border border-hairline bg-surface p-8 text-center shadow-md animate-wl-rise">
          <p className="mb-2 text-[17px] font-bold text-ink">
            This room is full
          </p>
          <p className="mb-5 text-sm text-text2">
            A room seats {ROOM_CAPACITY} people — video stays sharp only while
            everyone fits. Try again in a bit, or start your own.
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="wl-lift rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface"
            >
              Try again
            </button>
            <button
              onClick={() => router.push("/")}
              className="wl-lift rounded-full border border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink2"
            >
              Home
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (roomError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-[20px] border border-hairline bg-surface p-8 text-center shadow-md animate-wl-rise">
          <p className="mb-5 text-[15px] font-medium text-ink">{roomError}</p>
          <button
            onClick={() => router.push("/")}
            className="wl-lift rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface"
          >
            Back home
          </button>
        </div>
      </main>
    );
  }

  if (mediaError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-[20px] border border-hairline bg-surface p-8 text-center shadow-md animate-wl-rise">
          <p className="mb-5 text-[15px] font-medium text-ink">{mediaError}</p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="wl-lift rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface"
            >
              Try again
            </button>
            <button
              onClick={() => router.push("/")}
              className="wl-lift rounded-full border border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink2"
            >
              Home
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-screen min-h-[600px] w-full overflow-hidden bg-canvas text-ink">
      <CrewSidebar
        sessionName={room?.name ?? "Room"}
        subject={room?.subject ?? ""}
        roster={roster}
        myPeerId={myPeerId}
        locked={connected}
        collapsed={collapsed}
        mobOpen={mobOpen}
        onCollapse={() => {
          setCollapsed(true);
          setMobOpen(false);
        }}
        onCloseMobile={() => setMobOpen(false)}
        onLeave={leave}
      />

      <main className="flex h-screen min-w-0 flex-1 flex-col">
        {/* Ink band header — continuous with the sidebar zone. */}
        <header className="flex items-center justify-between gap-3 border-b border-bandline bg-band px-4 py-3 text-bandtext">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className={`wl-openbtn ${collapsed ? "wl-show" : ""} h-9 w-9 items-center justify-center rounded-[10px] border border-bandline bg-bandchip text-bandtext2 transition-colors duration-150 hover:text-bandtext`}
              onClick={() => {
                setCollapsed(false);
                setMobOpen(true);
              }}
              aria-label="Open crew panel"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <span
              className="hidden min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold sm:block"
              style={{ letterSpacing: "-0.01em" }}
            >
              {room?.name ?? ""}
            </span>
            {room?.visibility === "public" && room.institution && (
              <span
                className="hidden shrink-0 items-center gap-1.5 rounded-full border border-bandline bg-bandchip px-2.5 py-1 text-[11px] font-semibold text-bandtext2 md:flex"
                title={room.institution}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
                </svg>
                <span className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {room.institution}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-[11px] border border-bandline bg-bandchip py-[6px] pl-[13px] pr-[8px]">
              <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-bandtext2">
                Room
              </span>
              <span className="text-sm font-bold tracking-wide tabular-nums">
                {roomId ? displayRoomCode(roomId) : ""}
              </span>
              <button
                onClick={copyLink}
                aria-label="Copy invite link"
                title="Copy invite link"
                className="flex h-7 w-7 items-center justify-center rounded-[8px] text-bandtext2 transition-colors duration-150 hover:bg-bandchip hover:text-bandtext"
              >
                {copied ? (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#54a078"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M5 15V5a2 2 0 012-2h10" />
                  </svg>
                )}
              </button>
            </div>
            <SettingsMenu tone="band" />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {banner && (
          <div
            role="status"
            className="mx-auto mt-4 flex max-w-xl items-center justify-between gap-3 rounded-[14px] border border-hairline bg-dangertint px-4 py-2.5 text-sm font-medium text-danger shadow-md animate-wl-toast"
          >
            <span>{banner}</span>
            <button
              onClick={dismissWarning}
              aria-label="Dismiss warning"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-sunken"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <section
          className={`flex flex-col items-center px-6 ${
            banner ? "pt-4" : focusMode ? "pt-7" : "pt-10"
          } pb-6 animate-wl-rise`}
        >
          {room && (
            <Timer
              startedAt={room.startedAt}
              durationSec={room.durationSec}
              big={focusMode}
            />
          )}
          <div className="mt-3 text-[13.5px] text-text2">
            {deep
              ? "Deep Focus — everyone's muted, including you"
              : "Locked in — stay until the timer ends"}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <ControlPill
              onClick={toggleMute}
              disabled={deep}
              pressed={effectiveMuted}
              label={
                deep
                  ? "Mic muted by Deep Focus"
                  : muted
                    ? "Unmute"
                    : "Mute"
              }
            >
              <MicIcon off={effectiveMuted} />
              {deep ? "Mic off" : muted ? "Unmute" : "Mic"}
            </ControlPill>

            <ControlPill
              onClick={toggleCam}
              pressed={camOff}
              label={camOff ? "Turn camera on" : "Turn camera off"}
            >
              <CamIcon off={camOff} />
              {camOff ? "Camera off" : "Camera"}
            </ControlPill>

            <ControlPill
              onClick={() => setDeep((d) => !d)}
              pressed={deep}
              label={deep ? "Exit Deep Focus" : "Enter Deep Focus"}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 18v-6a9 9 0 0118 0v6" />
                <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
              </svg>
              {deep ? "Exit Deep Focus" : "Deep Focus"}
            </ControlPill>

            <ControlPill
              onClick={toggleFocus}
              pressed={focusMode}
              label={focusMode ? "Exit focus mode" : "Enter focus mode"}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {focusMode ? (
                  <path d="M9 9H4m0 0V4m0 5l6-6m5 5h5m0 0V4m0 5l-6-6M9 15H4m0 0v5m0-5l6 6m5-6h5m0 0v5m0-5l-6 6" />
                ) : (
                  <path d="M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3" />
                )}
              </svg>
              {focusMode ? "Exit focus" : "Focus mode"}
            </ControlPill>
          </div>

          <div className="sr-only" aria-live="polite">
            {connected
              ? `Connected, ${roster.length} participant${roster.length > 1 ? "s" : ""}`
              : "Connecting"}
          </div>
          {/* Screen-reader feedback for the icon-only copy button. */}
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? "Invite link copied" : ""}
          </span>
        </section>

        <div
          className={`wl-grid ${focusMode ? "wl-focus" : ""} mx-auto px-6 pb-8`}
        >
          <VideoTile
            stream={localStream}
            username={pseudo ?? "You"}
            tintKey={prefs.tint}
            muted
            mirrored
            isLocal
            compact={focusMode}
            speaking={speaking.has("self") && !effectiveMuted}
            micOff={effectiveMuted}
            deepBadge={deep}
          />
          {remotesList.map(([peerId, info]) => {
            const entry = rosterById.get(peerId);
            const st = entry?.status;
            const remoteMicOff = !!(st?.muted || st?.deep);
            return (
              <VideoTile
                key={peerId}
                stream={info.stream}
                username={info.username}
                tintKey={st?.tint}
                muted={deep}
                compact={focusMode}
                speaking={speaking.has(peerId) && !remoteMicOff && !deep}
                micOff={remoteMicOff}
                dimmed={!!st?.away}
              />
            );
          })}
        </div>
        </div>
      </main>
    </div>
  );
}

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {off ? (
        <>
          <path d="M1 1l22 22" />
          <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
          <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23" />
          <path d="M12 19v4M8 23h8" />
        </>
      ) : (
        <>
          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
          <path d="M19 10v2a7 7 0 01-14 0v-2" />
          <path d="M12 19v4M8 23h8" />
        </>
      )}
    </svg>
  );
}

function CamIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {off ? (
        <>
          <path d="M1 1l22 22" />
          <path d="M21 12v3l-5-3V9" />
          <path d="M8 5h6a2 2 0 012 2v2M3 7v10a2 2 0 002 2h9" />
        </>
      ) : (
        <>
          <rect x="2" y="6" width="13" height="12" rx="2" />
          <path d="M22 9l-7 3 7 3z" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
