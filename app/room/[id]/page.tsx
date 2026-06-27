"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getPseudo } from "@/lib/cookies";
import VideoTile from "@/components/VideoTile";
import Timer from "@/components/Timer";
import type PeerJS from "peerjs";
import type { MediaConnection } from "peerjs";

type PeerInfo = { peerId: string; username: string; lastSeen: number };
type RoomMeta = { name: string; durationSec: number; startedAt: number };

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

  const urlName = searchParams?.get("n") ?? null;
  const urlDuration = searchParams?.get("d") ?? null;
  const urlStartedAt = searchParams?.get("s") ?? null;

  const [pseudo, setPseudoState] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<
    Map<string, { username: string; stream: MediaStream }>
  >(new Map());
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [copied, setCopied] = useState(false);

  const roomRef = useRef<RoomMeta | null>(null);
  roomRef.current = room;

  // Read pseudo.
  useEffect(() => {
    const p = getPseudo();
    if (!p) {
      router.replace("/");
      return;
    }
    setPseudoState(p);
  }, [router]);

  // Resolve room metadata. URL params first, server fallback.
  useEffect(() => {
    if (!roomId) return;

    // Try URL params.
    if (urlName !== null && urlDuration !== null && urlStartedAt !== null) {
      const d = parseInt(urlDuration, 10);
      const s = parseInt(urlStartedAt, 10);
      if (Number.isFinite(d) && Number.isFinite(s) && d >= 60) {
        setRoom({
          name: decodeURIComponent(urlName) || "Study session",
          durationSec: d,
          startedAt: s,
        });
        return;
      }
    }

    // Fallback: ask the server.
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
        if (!res.ok) {
          if (alive)
            setRoomError(
              "Lien incomplet et room inconnue. Demande un lien complet à l'organisateur."
            );
          return;
        }
        const data = await res.json();
        if (alive && data.room) {
          setRoom({
            name: data.room.name,
            durationSec: data.room.durationSec,
            startedAt: data.room.startedAt,
          });
        }
      } catch {
        if (alive) setRoomError("Erreur réseau.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [roomId, urlName, urlDuration, urlStartedAt]);

  // Set up media + PeerJS mesh once room metadata is available.
  useEffect(() => {
    if (!roomId || !pseudo || !room) return;

    let cancelled = false;
    let peer: PeerJS | null = null;
    let myId: string | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let stream: MediaStream | null = null;
    const activeCalls = new Map<string, MediaConnection>();
    const peerUsernames = new Map<string, string>();
    const peerLastSeen = new Map<string, number>();
    const PEER_DROP_MS = 60_000;
    const REFRESH_MS = 4_000;

    // One round-trip does double duty: it refreshes our presence (heartbeat) and
    // returns the current peer list, so there is no separate poll loop.
    const announce = async () => {
      if (!myId) return;
      const r = roomRef.current;
      try {
        const res = await fetch(`/api/rooms/${roomId}/peers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            peerId: myId,
            username: pseudo,
            name: r?.name,
            durationSec: r?.durationSec,
            startedAt: r?.startedAt,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        onPeers(data.peers ?? []);
      } catch {}
    };

    const onPeers = (peers: PeerInfo[]) => {
      if (cancelled || !myId) return;
      const now = Date.now();

      for (const p of peers) {
        peerUsernames.set(p.peerId, p.username);
        peerLastSeen.set(p.peerId, now);
      }

      for (const p of peers) {
        if (p.peerId === myId) continue;
        if (activeCalls.has(p.peerId)) continue;
        if (myId < p.peerId) {
          if (!stream || !peer) continue;
          const call = peer.call(p.peerId, stream, {
            metadata: { username: pseudo },
          });
          if (call) attachCall(call, p.peerId);
        }
      }

      // Drop calls only after sustained absence — a single missed poll from a
      // serverless cold start should not tear down a healthy WebRTC connection.
      for (const peerId of Array.from(activeCalls.keys())) {
        const last = peerLastSeen.get(peerId) ?? 0;
        if (last > 0 && now - last > PEER_DROP_MS) {
          const call = activeCalls.get(peerId);
          try {
            call?.close();
          } catch {}
          activeCalls.delete(peerId);
          peerLastSeen.delete(peerId);
          setRemotes((prev) => {
            const next = new Map(prev);
            next.delete(peerId);
            return next;
          });
        }
      }

      setRemotes((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [pid, info] of prev) {
          const u = peerUsernames.get(pid);
          if (u && u !== info.username) {
            next.set(pid, { ...info, username: u });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    const attachCall = (call: MediaConnection, remotePeerId: string) => {
      activeCalls.set(remotePeerId, call);
      peerLastSeen.set(remotePeerId, Date.now());

      const meta = call.metadata as { username?: string } | undefined;
      if (meta?.username) peerUsernames.set(remotePeerId, meta.username);

      call.on("stream", (remoteStream: MediaStream) => {
        if (cancelled) return;
        const username = peerUsernames.get(remotePeerId) ?? "Anon";
        setRemotes((prev) => {
          const next = new Map(prev);
          next.set(remotePeerId, { username, stream: remoteStream });
          return next;
        });
      });
      call.on("close", () => {
        // Only retract state if THIS call is still the active one — a stale
        // call closing must not evict a fresher call that replaced it.
        if (activeCalls.get(remotePeerId) !== call) return;
        activeCalls.delete(remotePeerId);
        if (cancelled) return;
        setRemotes((prev) => {
          if (activeCalls.has(remotePeerId)) return prev;
          const next = new Map(prev);
          next.delete(remotePeerId);
          return next;
        });
      });
      call.on("error", () => {
        if (activeCalls.get(remotePeerId) === call) {
          activeCalls.delete(remotePeerId);
        }
      });
    };

    const init = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });
      } catch (e: any) {
        if (!cancelled) {
          setMediaError(
            e?.name === "NotAllowedError"
              ? "Permission refusée. Autorise la caméra et le micro."
              : "Impossible d'accéder à la caméra/micro."
          );
        }
        return;
      }
      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      setLocalStream(stream);

      const PeerModule = await import("peerjs");
      const Peer = PeerModule.default;
      if (cancelled) return;

      peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:global.stun.twilio.com:3478" },
          ],
        },
      });

      peer.on("open", (id) => {
        if (cancelled) {
          try {
            peer?.destroy();
          } catch {}
          return;
        }
        myId = id;
        setConnected(true);
        announce();
        refreshTimer = setInterval(announce, REFRESH_MS);
      });

      peer.on("call", (call) => {
        if (cancelled || !stream) return;
        // If we already hold a call for this peer, the inbound one is the
        // fresher attempt (e.g. after a reconnect): close the old, keep the new.
        const existing = activeCalls.get(call.peer);
        if (existing && existing !== call) {
          try {
            existing.close();
          } catch {}
        }
        call.answer(stream);
        attachCall(call, call.peer);
      });

      peer.on("error", (err) => {
        console.error("PeerJS error", err);
      });

      peer.on("disconnected", () => {
        try {
          peer?.reconnect();
        } catch {}
      });
    };

    init();

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      for (const call of activeCalls.values()) {
        try {
          call.close();
        } catch {}
      }
      if (peer) {
        try {
          peer.destroy();
        } catch {}
      }
      if (stream) {
        for (const t of stream.getTracks()) t.stop();
      }
      if (myId) {
        try {
          fetch(`/api/rooms/${roomId}/peers?peerId=${myId}`, {
            method: "DELETE",
            keepalive: true,
          });
        } catch {}
      }
    };
  }, [roomId, pseudo, room]);

  const toggleMute = () => {
    if (!localStream) return;
    const next = !muted;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const toggleCam = () => {
    if (!localStream) return;
    const next = !camOff;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCamOff(next);
  };

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
              copied
                ? "bg-emerald-500/80"
                : "bg-white/10 hover:bg-white/20"
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
