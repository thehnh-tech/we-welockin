"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getPseudo } from "@/lib/cookies";
import { displayRoomCode } from "@/lib/roomCode";
import { formatDuration } from "@/lib/time";
import VideoTile from "@/components/VideoTile";
import Timer from "@/components/Timer";
import CrewSidebar from "@/components/CrewSidebar";
import { useRoomMeta } from "./hooks/useRoomMeta";
import { useLocalMedia } from "./hooks/useLocalMedia";
import { usePeerMesh, type PeerStatus } from "./hooks/usePeerMesh";
import { useAway } from "./hooks/useAway";
import { useSpeaking } from "./hooks/useSpeaking";
import { useNow } from "./hooks/useNow";
import { useFocusRecorder } from "./hooks/useFocusRecorder";

export default function RoomPage() {
  return (
    <Suspense fallback={null}>
      <RoomInner />
    </Suspense>
  );
}

function RoomInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const roomId = params.id;
  const router = useRouter();

  const [pseudo, setPseudoState] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deep, setDeep] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobOpen, setMobOpen] = useState(false);

  // Read pseudo (bounce home if absent).
  useEffect(() => {
    const p = getPseudo();
    if (!p) {
      router.replace("/");
      return;
    }
    setPseudoState(p);
  }, [router]);

  const { room, roomError } = useRoomMeta(
    roomId,
    searchParams?.get("n") ?? null,
    searchParams?.get("d") ?? null,
    searchParams?.get("s") ?? null,
    searchParams?.get("sub") ?? null
  );

  const { localStream, mediaError, muted, camOff, toggleMute, toggleCam } =
    useLocalMedia(!!pseudo && !!room);

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
  const statusRef = useRef<PeerStatus>({ muted: false, away: false, deep: false });

  const {
    connected,
    myPeerId,
    remotes,
    roster,
    banner,
    dismissWarning,
    refreshStatus,
  } = usePeerMesh({ roomId, pseudo, room, localStream, statusRef });

  // Push status changes immediately instead of waiting for the heartbeat.
  useEffect(() => {
    statusRef.current = { muted: effectiveMuted, away, deep };
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMuted, away, deep]);

  useFocusRecorder(connected);
  const now = useNow(1000);

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
  const selfEntry = myPeerId ? rosterById.get(myPeerId) : undefined;
  const remotesList = useMemo(() => Array.from(remotes.entries()), [remotes]);

  if (roomError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-line bg-panel p-8 text-center">
          <p className="mb-5 text-base font-medium text-zinc-200">{roomError}</p>
          <button
            onClick={() => router.push("/")}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold hover:brightness-110"
          >
            Retour à l&apos;accueil
          </button>
        </div>
      </main>
    );
  }

  if (mediaError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-line bg-panel p-8 text-center">
          <p className="mb-5 text-base font-medium text-zinc-200">{mediaError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mr-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold hover:brightness-110"
          >
            Réessayer
          </button>
          <button
            onClick={() => router.push("/")}
            className="rounded-xl border border-line2 bg-transparent px-5 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-line"
          >
            Accueil
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-screen min-h-[600px] w-full overflow-hidden bg-bg text-white">
      <CrewSidebar
        sessionName={room?.name ?? "Room"}
        subject={room?.subject ?? ""}
        roster={roster}
        myPeerId={myPeerId}
        now={now}
        collapsed={collapsed}
        mobOpen={mobOpen}
        onCollapse={() => {
          setCollapsed(true);
          setMobOpen(false);
        }}
        onCloseMobile={() => setMobOpen(false)}
        onLeave={leave}
      />

      <main className="relative h-screen min-w-0 flex-1 overflow-y-auto">
        <button
          className={`wl-openbtn ${collapsed ? "wl-show" : ""} absolute left-[18px] top-[18px] z-20 h-10 w-10 items-center justify-center rounded-xl border border-line2 bg-panel text-zinc-200 hover:bg-line`}
          onClick={() => {
            setCollapsed(false);
            setMobOpen(true);
          }}
          aria-label="Ouvrir le panneau des participants"
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

        <div className="absolute right-[18px] top-[18px] z-20 flex items-center gap-2 rounded-xl border border-line2 bg-panel py-[7px] pl-[13px] pr-[9px]">
          <span className="text-[11px] font-bold tracking-wider text-zinc-500">
            ROOM
          </span>
          <span className="font-mono text-sm font-bold tracking-wider text-zinc-200">
            {roomId ? displayRoomCode(roomId) : ""}
          </span>
          <button
            onClick={copyLink}
            aria-label="Copier le lien d'invitation"
            title="Copier le lien d'invitation"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-line2 hover:text-white"
          >
            {copied ? (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2.6"
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
                strokeWidth="2"
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

        {banner && (
          <div
            role="status"
            className="mx-auto mt-[70px] flex max-w-xl items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-sm text-amber-200"
          >
            <span>{banner}</span>
            <button
              onClick={dismissWarning}
              aria-label="Masquer l'avertissement"
              className="shrink-0 text-amber-200/70 hover:text-amber-100"
            >
              ✕
            </button>
          </div>
        )}

        <section
          className={`flex flex-col items-center px-6 ${
            banner ? "pt-5" : focusMode ? "pt-[34px]" : "pt-16"
          } pb-6`}
        >
          {room && (
            <Timer
              startedAt={room.startedAt}
              durationSec={room.durationSec}
              big={focusMode}
            />
          )}
          <div className="mt-3 text-[13px] font-medium text-zinc-400">
            {deep
              ? "Deep Focus · tout est silencieux, ton micro est coupé"
              : "Lock in · reste concentré jusqu'à la fin du timer"}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <button
              onClick={toggleMute}
              disabled={deep}
              aria-pressed={effectiveMuted}
              aria-label={
                deep
                  ? "Micro coupé par le Deep Focus"
                  : muted
                    ? "Réactiver le micro"
                    : "Couper le micro"
              }
              className={`flex items-center gap-2 rounded-[9px] border px-3.5 py-2 text-xs font-semibold transition-colors ${
                deep
                  ? "border-line2 bg-panel text-zinc-600"
                  : muted
                    ? "border-line2 bg-panel text-zinc-400 hover:border-accent hover:text-white"
                    : "border-accent bg-indigo-500/15 text-indigo-200"
              }`}
            >
              <MicIcon off={effectiveMuted} />
              {deep ? "Micro coupé" : muted ? "Réactiver" : "Micro"}
            </button>

            <button
              onClick={toggleCam}
              aria-pressed={camOff}
              aria-label={camOff ? "Réactiver la caméra" : "Couper la caméra"}
              className={`flex items-center gap-2 rounded-[9px] border px-3.5 py-2 text-xs font-semibold transition-colors ${
                camOff
                  ? "border-line2 bg-panel text-zinc-400 hover:border-accent hover:text-white"
                  : "border-accent bg-indigo-500/15 text-indigo-200"
              }`}
            >
              <CamIcon off={camOff} />
              {camOff ? "Caméra coupée" : "Caméra"}
            </button>

            <button
              onClick={() => setDeep((d) => !d)}
              aria-pressed={deep}
              className={`flex items-center gap-2 rounded-[9px] border px-3.5 py-2 text-xs font-semibold transition-colors ${
                deep
                  ? "border-accent bg-indigo-500/15 text-indigo-200"
                  : "border-line2 bg-panel text-zinc-400 hover:border-accent hover:text-white"
              }`}
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
              {deep ? "Quitter le Deep Focus" : "Deep Focus"}
            </button>

            <button
              onClick={toggleFocus}
              aria-pressed={focusMode}
              className={`flex items-center gap-2 rounded-[9px] border px-3.5 py-2 text-xs font-semibold transition-colors ${
                focusMode
                  ? "border-accent bg-indigo-500/15 text-indigo-200"
                  : "border-line2 bg-panel text-zinc-400 hover:border-accent hover:text-white"
              }`}
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
              {focusMode ? "Quitter le mode focus" : "Mode focus"}
            </button>
          </div>

          <div className="sr-only" aria-live="polite">
            {connected
              ? `Connecté, ${roster.length} participant${roster.length > 1 ? "s" : ""}`
              : "Connexion en cours"}
          </div>
          {/* Screen-reader feedback for the icon-only copy button. */}
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? "Lien d'invitation copié" : ""}
          </span>
        </section>

        <div
          className={`wl-grid ${focusMode ? "wl-focus" : ""} mx-auto px-6 pb-8`}
        >
          <VideoTile
            stream={localStream}
            username={pseudo ?? "Toi"}
            muted
            mirrored
            isLocal
            compact={focusMode}
            speaking={speaking.has("self") && !effectiveMuted}
            micOff={effectiveMuted}
            deepBadge={deep}
            focusTime={
              selfEntry
                ? formatDuration((now - selfEntry.joinedAt) / 1000)
                : undefined
            }
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
                muted={deep}
                compact={focusMode}
                speaking={speaking.has(peerId) && !remoteMicOff && !deep}
                micOff={remoteMicOff}
                dimmed={!!st?.away}
                focusTime={
                  entry
                    ? formatDuration((now - entry.joinedAt) / 1000)
                    : undefined
                }
              />
            );
          })}
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
