import { useEffect, useRef, useState } from "react";

const CHANNEL = "wlis-device";
const PROBE_WINDOW_MS = 350;

// One live session per device: before joining, probe other tabs over a
// BroadcastChannel; if any tab answers "occupied", block this one (the camera
// and the mesh are never started). Best-effort — a race between two tabs
// joining in the same instant lets both in, which is acceptable.
export function useDeviceGuard(roomId: string | undefined): {
  ready: boolean; // probe window elapsed — safe to start media/mesh
  blocked: boolean; // another tab on this device is already in a room
} {
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const holdingRef = useRef(false); // this tab owns the session slot

  useEffect(() => {
    if (!roomId) return;

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
    } catch {
      // No BroadcastChannel support: skip the guard.
      setReady(true);
      return;
    }

    const nonce = Math.random().toString(36).slice(2);
    let probeAnswered = false;

    bc.onmessage = (e: MessageEvent) => {
      const m = (e.data ?? {}) as { type?: string; nonce?: string; to?: string };
      if (m.type === "occupied" && m.to === nonce) {
        probeAnswered = true;
        holdingRef.current = false;
        setBlocked(true);
        setReady(true);
      }
      // Answer other tabs' probes only once we hold the slot.
      if (m.type === "probe" && holdingRef.current && m.nonce) {
        bc?.postMessage({ type: "occupied", to: m.nonce });
      }
    };

    bc.postMessage({ type: "probe", nonce });
    const t = setTimeout(() => {
      if (!probeAnswered) {
        holdingRef.current = true;
        setReady(true);
      }
    }, PROBE_WINDOW_MS);

    return () => {
      clearTimeout(t);
      holdingRef.current = false;
      try {
        bc?.close();
      } catch {}
    };
  }, [roomId]);

  return { ready, blocked };
}
