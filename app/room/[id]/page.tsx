"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPseudo } from "@/lib/cookies";
import VideoTile from "@/components/VideoTile";
import Timer from "@/components/Timer";

type PeerInfo = { peerId: string; username: string; lastSeen: number };
type RoomInfo = {
  id: string;
  name: string;
  durationSec: number;
  startedAt: number;
  peerCount: number;
};

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id;
  const router = useRouter();

  const [pseudo, setPseudoState] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<
    Map<string, { username: string; stream: MediaStream }>
  >(new Map());
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  const myPeerIdRef = useRef<string | null>(null);

  // 1. Read pseudo. Redirect home if absent.
  useEffect(() => {
    const p = getPseudo();
    if (!p) {
      router.replace("/");
      return;
    }
    setPseudoState(p);
  }, [router]);

  // 2. Fetch room metadata.
  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    const fetchRoom = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
        if (!res.ok) {
          if (alive) setRoomError("Room introuvable");
          return;
        }
        const data = await res.json();
        if (alive) setRoom(data.room);
      } catch {
        if (alive) setRoomError("Erreur réseau");
      }
    };
    fetchRoom();
    const t = setInterval(fetchRoom, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [roomId]);

  // 3. Set up media + PeerJS mesh. Runs once per room when pseudo known.
  useEffect(() => {
    if (!roomId || !pseudo) return;

    let cancelled = false;
    let peer: any = null;
    let myId: string | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stream: MediaStream | null = null;
    const activeCalls = new Map<string, any>();
    const peerUsernames = new Map<string, string>();

    const announce = async () => {
      if (!myId) return;
      try {
        await fetch(`/api/rooms/${roomId}/peers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerId: myId, username: pseudo }),
        });
      } catch {}
    };

    const onPeers = (peers: PeerInfo[]) => {
      if (cancelled || !myId) return;
      const seenIds = new Set(peers.map((p) => p.peerId));

      for (const p of peers) {
        peerUsernames.set(p.peerId, p.username);
      }

      // Initiate calls to new peers only if my id < their id (deterministic).
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

      // Drop calls to peers that disappeared.
      for (const peerId of Array.from(activeCalls.keys())) {
        if (!seenIds.has(peerId)) {
          const call = activeCalls.get(peerId);
          try {
            call?.close();
          } catch {}
          activeCalls.delete(peerId);
          setRemotes((prev) => {
            const next = new Map(prev);
            next.delete(peerId);
            return next;
          });
        }
      }

      // Update usernames on existing remotes.
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

    const attachCall = (call: any, remotePeerId: string) => {
      activeCalls.set(remotePeerId, call);

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
        activeCalls.delete(remotePeerId);
        if (cancelled) return;
        setRemotes((prev) => {
          const next = new Map(prev);
          next.delete(remotePeerId);
          return next;
        });
      });
      call.on("error", () => {
        activeCalls.delete(remotePeerId);
      });
    };

    const poll = async () => {
      if (!myId) return;
      try {
        const res = await fetch(`/api/rooms/${roomId}/peers`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        onPeers(data.peers ?? []);
      } catch {}
    };

    const init = async () => {
      // Camera + mic.
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

      // PeerJS.
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

      peer.on("open", (id: string) => {
        if (cancelled) {
          try {
            peer.destroy();
          } catch {}
          return;
        }
        myId = id;
        myPeerIdRef.current = id;
        setConnected(true);
        announce();
        poll();
        heartbeatTimer = setInterval(announce, 5000);
        pollTimer = setInterval(poll, 3000);
      });

      peer.on("call", (call: any) => {
        if (cancelled || !stream) return;
        call.answer(stream);
        attachCall(call, call.peer);
      });

      peer.on("error", (err: any) => {
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
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pollTimer) clearInterval(pollTimer);
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
  }, [roomId, pseudo]);

  // Toggle mic.
  const toggleMute = () => {
    if (!localStream) return;
    const next = !muted;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  // Toggle cam.
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
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {}
  };

  const remotesList = useMemo(
    () => Array.from(remotes.entries()),
    [remotes]
  );

  if (roomError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg mb-4">{roomError}</p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 rounded-lg bg-accent"
          >
            Retour à l'accueil
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
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
            title="Copier le lien"
          >
            Inviter
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
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            muted ? "bg-red-500/80" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {muted ? "Micro coupé" : "Micro"}
        </button>
        <button
          onClick={toggleCam}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            camOff ? "bg-red-500/80" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {camOff ? "Caméra coupée" : "Caméra"}
        </button>
      </footer>
    </main>
  );
}
