import { useEffect, useRef, useState } from "react";
import type PeerJS from "peerjs";
import type { MediaConnection } from "peerjs";
import { buildPeerOptions, peerErrorMessage } from "@/lib/rtc-config";
import {
  ANNOUNCE_TIMEOUT_MS,
  HEARTBEAT_BACKOFF_MAX_MS,
  HEARTBEAT_MS,
  JOIN_BURST_DELAYS_MS,
  PEER_DROP_MS,
  ROOM_FULL_RETRY_MS,
  STALL_HINT_MS,
  VIDEO_MAX_BITRATE,
} from "@/lib/constants";
import type { RoomMeta } from "./useRoomMeta";

export type PeerStatus = {
  muted: boolean;
  away: boolean;
  deep: boolean;
  tint: string;
};

export type RosterEntry = {
  peerId: string;
  username: string;
  lastSeen: number;
  joinedAt: number;
  status: PeerStatus;
};

export type Remote = { username: string; stream: MediaStream };

// Why the server refused to seat us. Not a transient warning: neither clears
// on its own, so the room page swaps the whole view for an explanation.
export type BlockedReason = "verification" | "full" | null;

const STALL_HINT =
  "Can't reach the others on this network — some Wi-Fi networks (office, 4G) block video. Try another network.";

// The WebRTC mesh: signaling presence via REST, calling every other peer
// (lower id initiates), and tracking remote streams. The live status is read
// through a ref so changing it does not tear the mesh down; status changes are
// pushed on the next heartbeat (or via refreshStatus). Announces carry no room
// metadata — the server reads the room as stored.
export function usePeerMesh(opts: {
  roomId: string | undefined;
  pseudo: string | null;
  room: RoomMeta | null;
  localStream: MediaStream | null;
  statusRef: React.RefObject<PeerStatus>;
}): {
  connected: boolean;
  myPeerId: string | null;
  remotes: Map<string, Remote>;
  roster: RosterEntry[];
  banner: string | null;
  blockedReason: BlockedReason;
  dismissWarning: () => void;
  refreshStatus: () => void;
} {
  const { roomId, pseudo, room, localStream, statusRef } = opts;

  const [connected, setConnected] = useState(false);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [remotes, setRemotes] = useState<Map<string, Remote>>(new Map());
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [othersCount, setOthersCount] = useState(0);
  const [connWarning, setConnWarning] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const [blockedReason, setBlockedReason] = useState<BlockedReason>(null);

  // Lets the page push a status change immediately instead of waiting for the
  // next heartbeat.
  const announceNowRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!roomId || !pseudo || !room || !localStream) return;

    const stream = localStream;
    let cancelled = false;
    let peer: PeerJS | null = null;
    let myId: string | null = null;
    // Heartbeats run on a self-scheduled setTimeout chain, not setInterval:
    // the next delay depends on what the last answer was (join burst, 429
    // backoff, full-room probe), and a fixed interval cannot express that.
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false; // terminal refusal (403/404) — no more beats
    let backoffMs = 0; // >0 while throttled; reset on the first success
    let slowRetry = false; // seated refused (room full): probe slowly
    let burst: number[] = []; // quick follow-up beats right after joining
    let reconnectDelay = 1_000;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const activeCalls = new Map<string, MediaConnection>();
    const peerUsernames = new Map<string, string>();
    const peerLastSeen = new Map<string, number>();

    // Proof that this peer id is ours, minted by the server on our first
    // announce. Sent back on every later announce and on leaving, so nobody
    // else in the room can adopt our id or evict us with it.
    let peerToken: string | null = null;
    let inFlight = false;

    // One round-trip does double duty: it refreshes our presence (heartbeat,
    // including live status) and returns the current peer list, so there is no
    // separate poll loop.
    //
    // Calls are serialized: a status change can fire this while the heartbeat
    // is still open, and two announces racing for the same peer id would have
    // the second one rejected as an impersonation attempt.
    const announce = async () => {
      if (!myId || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/rooms/${roomId}/peers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            peerId: myId,
            peerToken,
            username: pseudo,
            status: statusRef.current,
          }),
          // Guarded: AbortSignal.timeout needs Safari 16+. Without a timeout a
          // hung announce would silently block every later beat (inFlight).
          signal:
            typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
              ? AbortSignal.timeout(ANNOUNCE_TIMEOUT_MS)
              : undefined,
        });
        if (!res.ok) {
          if (cancelled) return;
          // These mean the session cannot proceed at all, so they get a screen
          // of their own rather than a dismissible banner — and the heartbeat
          // stops: a refused caller re-announcing every beat is pure load.
          if (res.status === 403) {
            stopped = true;
            setBlockedReason("verification");
            return;
          }
          // The room has ended (or never existed): rooms are born only via
          // explicit creation now, so a heartbeat cannot revive this one.
          if (res.status === 404) {
            stopped = true;
            setConnWarning(
              "This study session has ended. Start a new room to keep going."
            );
            return;
          }
          if (res.status === 409) {
            // 409 covers two different answers: the room is full, or this peer
            // id is already claimed by someone holding its token. Neither is
            // fatal: a full room is probed slowly for a freed seat, and a
            // contested id resolves on the next beat.
            const why = await res.json().catch(() => ({}));
            if (why?.error === "room_full") {
              slowRetry = true;
              setBlockedReason("full");
            } else console.error("announce conflict", why?.error);
            return;
          }
          // Throttling is transient — back off (doubling, capped safely under
          // the server's 30s presence timeout) instead of keeping the shared
          // budget saturated, and say so rather than blaming the link.
          if (res.status === 429) {
            const retryAfter =
              Number(res.headers.get("Retry-After") ?? "") * 1000 || 0;
            backoffMs = Math.min(
              Math.max(backoffMs * 2 || HEARTBEAT_MS * 2, retryAfter),
              HEARTBEAT_BACKOFF_MAX_MS
            );
            setConnWarning(
              "Too many people on this network right now. Reconnecting…"
            );
            return;
          }
          // Other 4xx are deterministic (413 forged oversized link, 400 bad
          // room id…): surface them instead of failing presence silently. 5xx
          // stays quiet — transient server errors resolve on the next beat.
          if (res.status >= 400 && res.status < 500) {
            console.error("announce rejected", res.status);
            setConnWarning(
              "This link looks invalid. Reload the page or ask for a fresh one."
            );
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        // Seated. First time: queue the join burst so the roster fills fast.
        if (!peerToken) burst = [...JOIN_BURST_DELAYS_MS];
        if (typeof data.peerToken === "string") peerToken = data.peerToken;
        if (backoffMs > 0) setConnWarning(null); // recovered from throttling
        backoffMs = 0;
        if (slowRetry) {
          // A seat freed up and we took it — restore the room view.
          slowRetry = false;
          setBlockedReason(null);
        }
        onPeers(data.peers ?? []);
      } catch {
        // Network blip or timeout: stay quiet, the next heartbeat retries.
      } finally {
        inFlight = false;
      }
    };

    const nextDelay = () => {
      if (slowRetry) return ROOM_FULL_RETRY_MS;
      if (backoffMs > 0) {
        // ±30% jitter so a whole library does not resynchronize its retries
        // on the same second after a shared-window reset.
        return backoffMs * (0.7 + Math.random() * 0.6);
      }
      const burstDelay = burst.shift();
      return burstDelay ?? HEARTBEAT_MS;
    };

    // The heartbeat chain: announce, then schedule the next beat from what
    // just happened. Every scheduling path funnels through here.
    const beat = async () => {
      heartbeatTimer = null;
      await announce();
      if (cancelled || stopped) return;
      heartbeatTimer = setTimeout(beat, nextDelay());
    };
    const kick = () => {
      if (cancelled || stopped) return;
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
      beat();
    };
    // Status changes push immediately — unless we are throttled or refused,
    // in which case jumping the queue would defeat the backoff.
    announceNowRef.current = () => {
      if (backoffMs > 0 || slowRetry) return;
      kick();
    };

    const onPeers = (peers: RosterEntry[]) => {
      if (cancelled || !myId) return;
      const now = Date.now();

      for (const p of peers) {
        peerUsernames.set(p.peerId, p.username);
        peerLastSeen.set(p.peerId, now);
      }
      setRoster(peers);
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

    // Cap what we SEND on this connection. A 6-tile grid never shows more
    // than ~200px of video per face, and a full room means 5 parallel
    // encodes: uncapped VGA VP8 (~1-1.4 Mbps each) saturates a laptop uplink
    // on shared campus Wi-Fi. Idempotent — safe to re-apply after
    // renegotiation or a late sender.
    const capOutgoingBitrate = (call: MediaConnection) => {
      try {
        const pc = call.peerConnection;
        if (!pc) return;
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind !== "video") continue;
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          if (params.encodings[0].maxBitrate === VIDEO_MAX_BITRATE) continue;
          params.encodings[0].maxBitrate = VIDEO_MAX_BITRATE;
          sender.setParameters(params).catch(() => {});
        }
      } catch {}
    };

    const attachCall = (call: MediaConnection, remotePeerId: string) => {
      activeCalls.set(remotePeerId, call);
      peerLastSeen.set(remotePeerId, Date.now());
      capOutgoingBitrate(call);

      const meta = call.metadata as { username?: string } | undefined;
      if (meta?.username) peerUsernames.set(remotePeerId, meta.username);

      call.on("stream", (remoteStream: MediaStream) => {
        if (cancelled) return;
        capOutgoingBitrate(call);
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
        // Fires on first connect AND after every successful reconnect —
        // reset the reconnect backoff and (re)start the heartbeat chain.
        reconnectDelay = 1_000;
        myId = id;
        setMyPeerId(id);
        setConnected(true);
        kick();
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
        // A reconnect whose id is still registered on the broker comes back
        // as unavailable-id, a fatal error that destroys the Peer. Recover by
        // building a fresh Peer with a fresh id instead of asking the user to
        // reload: the old seat expires server-side within 30s and everyone
        // re-calls the new id off the next roster.
        if ((err as { type?: string })?.type === "unavailable-id") {
          try {
            peer?.destroy();
          } catch {}
          setTimeout(() => {
            if (!cancelled) init();
          }, 1_000);
          return;
        }
        const msg = peerErrorMessage((err as { type?: string })?.type);
        if (msg) setConnWarning(msg);
      });

      peer.on("disconnected", () => {
        if (cancelled) return;
        // Exponential backoff with ±50% jitter. An immediate reconnect loop
        // (each failed socket re-fires "disconnected") from 200 clients
        // behind the same campus IPs reads as an attack to the broker and
        // prolongs the very outage it is retrying against.
        if (reconnectTimer) clearTimeout(reconnectTimer);
        const delay = reconnectDelay * (0.5 + Math.random());
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        reconnectTimer = setTimeout(() => {
          if (cancelled) return;
          try {
            peer?.reconnect();
          } catch {}
        }, delay);
      });
    };

    init();

    return () => {
      cancelled = true;
      announceNowRef.current = () => {};
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
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
      if (myId && peerToken) {
        try {
          const qs = new URLSearchParams({ peerId: myId, token: peerToken });
          fetch(`/api/rooms/${roomId}/peers?${qs}`, {
            method: "DELETE",
            keepalive: true,
          });
        } catch {}
      }
    };
  }, [roomId, pseudo, room, localStream, statusRef]);

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
  const refreshStatus = () => announceNowRef.current();

  return {
    connected,
    myPeerId,
    remotes,
    roster,
    banner,
    blockedReason,
    dismissWarning,
    refreshStatus,
  };
}
