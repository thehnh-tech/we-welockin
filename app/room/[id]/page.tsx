"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getPseudo } from "@/lib/cookies";
import VideoTile from "@/components/VideoTile";
import Timer from "@/components/Timer";
import { useRoomMeta } from "./hooks/useRoomMeta";
import { useLocalMedia } from "./hooks/useLocalMedia";
import { usePeerMesh } from "./hooks/usePeerMesh";

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
    searchParams?.get("s") ?? null
  );

  const { localStream, mediaError, muted, camOff, toggleMute, toggleCam } =
    useLocalMedia(!!pseudo && !!room);

  const { connected, remotes, banner, dismissWarning } = usePeerMesh({
    roomId,
    pseudo,
    room,
    localStream,
  });

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

  const remotesList = useMemo(() => Array.from(remotes.entries()), [remotes]);

  if (roomError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-lg mb-4">{roomError}</p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 rounded-lg bg-accent"
          >
            Retour à l&apos;accueil
          </button>
        </div>
      </main>
    );
  }

  if (mediaError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-lg mb-4">{mediaError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-accent mr-2"
          >
            Réessayer
          </button>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 rounded-lg bg-white/10"
          >
            Accueil
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="font-semibold">{room?.name ?? "Room"}</div>
            <div className="text-xs text-white/40">
              {connected ? "Connecté" : "Connexion..."} ·{" "}
              {remotesList.length + 1}{" "}
              {remotesList.length + 1 > 1 ? "participants" : "participant"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              copied ? "bg-emerald-500/80" : "bg-white/10 hover:bg-white/20"
            }`}
            title="Copier le lien d'invitation"
          >
            {copied ? "Lien copié !" : "Inviter"}
          </button>
          <button
            onClick={leave}
            className="px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-sm"
          >
            Quitter
          </button>
        </div>
      </header>

      {banner && (
        <div
          role="status"
          className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-sm flex items-center justify-between gap-3"
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

      <div className="flex-1 p-4 md:p-6 flex flex-col items-center gap-6">
        {room && (
          <Timer startedAt={room.startedAt} durationSec={room.durationSec} />
        )}

        <div className="w-full grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-w-6xl">
          <VideoTile
            stream={localStream}
            username={pseudo ?? "Toi"}
            muted
            mirrored
            isLocal
          />
          {remotesList.map(([peerId, info]) => (
            <VideoTile
              key={peerId}
              stream={info.stream}
              username={info.username}
            />
          ))}
        </div>
      </div>

      <footer className="px-6 py-4 border-t border-white/5 flex items-center justify-center gap-3">
        <button
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Réactiver le micro" : "Couper le micro"}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            muted ? "bg-red-500/80" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {muted ? "🔇 Micro coupé" : "🎤 Micro"}
        </button>
        <button
          onClick={toggleCam}
          aria-pressed={camOff}
          aria-label={camOff ? "Réactiver la caméra" : "Couper la caméra"}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            camOff ? "bg-red-500/80" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {camOff ? "📷 Caméra coupée" : "📹 Caméra"}
        </button>
      </footer>
    </main>
  );
}
