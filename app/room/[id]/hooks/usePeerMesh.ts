import { useEffect, useRef, useState } from "react";
import type PeerJS from "peerjs";
import type { MediaConnection } from "peerjs";
import { buildPeerOptions, peerErrorMessage } from "@/lib/rtc-config";
import { HEARTBEAT_MS, PEER_DROP_MS, STALL_HINT_MS } from "@/lib/constants";
import type { RoomMeta } from "./useRoomMeta";

type PeerInfo = { peerId: string; username: string; lastSeen: number };
export type Remote = { username: string; stream: MediaStream };

const STALL_HINT =
  "Connexion difficile avec les autres participants. Sur certains réseaux (NAT strict, 4G, Wi-Fi d'entreprise), un serveur TURN est nécessaire.";

// The WebRTC mesh: signaling presence via REST, calling every other peer
// (lower id initiates), and tracking remote streams. The room metadata is read
// through a ref so changing it does not tear the mesh down.
export function usePeerMesh(opts: {
  roomId: string | undefined;
  pseudo: string | null;
  room: RoomMeta | null;
  localStream: MediaStream | null;
}): {
  connected: boolean;
  remotes: Map<string, Remote>;
  banner: string | null;
  dismissWarning: () => void;
} {
  const { roomId, pseudo, room, localStream } = opts;

  const [connected, setConnected] = useState(false);
  const [remotes, setRemotes] = useState<Map<string, Remote>>(new Map());
  const [othersCount, setOthersCount] = useState(0);
  const [connWarning, setConnWarning] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);

  const roomRef = useRef<RoomMeta | null>(room);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    if (!roomId || !pseudo || !room || !localStream) return;

    const stream = localStream;
    let cancelled = false;
    let peer: PeerJS | null = null;
    let myId: string | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    const activeCalls = new Map<string, MediaConnection>();
    const peerUsernames = new Map<string, string>();
    const peerLastSeen = new Map<string, number>();

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
      setOthersCount(peers.filter((p) => p.peerId !== myId).length);

      for (const p of peers) {
        if (p.peerId === myId) continue;
        if (activeCalls.has(p.peerId)) continue;
        if (myId < p.peerId) {
          if (!peer) continue;
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
      const PeerModule = await import("peerjs");
      const Peer = PeerModule.default;
      if (cancelled) return;

      peer = new Peer(buildPeerOptions());

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
        refreshTimer = setInterval(announce, HEARTBEAT_MS);
      });

      peer.on("call", (call) => {
        if (cancelled) return;
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
        if (cancelled) return;
        const msg = peerErrorMessage((err as { type?: string })?.type);
        if (msg) setConnWarning(msg);
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
      if (myId) {
        try {
          fetch(`/api/rooms/${roomId}/peers?peerId=${myId}`, {
            method: "DELETE",
            keepalive: true,
          });
        } catch {}
      }
    };
  }, [roomId, pseudo, room, localStream]);

  // If other participants are present but no media connection has established
  // after a grace period, surface a TURN hint (classic symmetric-NAT symptom).
  useEffect(() => {
    if (connected && othersCount > 0 && remotes.size === 0) {
      const t = setTimeout(() => setStalled(true), STALL_HINT_MS);
      return () => clearTimeout(t);
    }
    setStalled(false);
  }, [connected, othersCount, remotes]);

  const banner = connWarning ?? (stalled ? STALL_HINT : null);
  const dismissWarning = () => {
    setConnWarning(null);
    setStalled(false);
  };

  return { connected, remotes, banner, dismissWarning };
}
