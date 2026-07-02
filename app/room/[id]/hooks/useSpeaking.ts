import { useEffect, useState } from "react";

const RMS_THRESHOLD = 0.04;
const HOLD_MS = 600; // keep "speaking" on through brief pauses
const TICK_MS = 180;

// Voice-activity detection on a set of MediaStreams via WebAudio time-domain
// RMS. Returns the ids currently speaking. Purely local — nothing is sent.
export function useSpeaking(
  streams: Map<string, MediaStream>,
  enabled = true
): Set<string> {
  const [speaking, setSpeaking] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!enabled || streams.size === 0) {
      setSpeaking((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;

    let ctx: AudioContext;
    try {
      ctx = new Ctx();
    } catch {
      return;
    }

    const analysers: { id: string; analyser: AnalyserNode; data: Uint8Array }[] =
      [];
    for (const [id, stream] of streams) {
      if (stream.getAudioTracks().length === 0) continue;
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        analysers.push({ id, analyser, data: new Uint8Array(analyser.fftSize) });
      } catch {}
    }
    if (analysers.length === 0) {
      ctx.close().catch(() => {});
      return;
    }

    const lastLoud = new Map<string, number>();
    const timer = setInterval(() => {
      // Autoplay policy can start the context suspended; resuming is allowed
      // once the user has interacted with the page (they joined a room).
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = Date.now();
      const next = new Set<string>();
      for (const a of analysers) {
        a.analyser.getByteTimeDomainData(a.data);
        let sum = 0;
        for (let i = 0; i < a.data.length; i++) {
          const v = (a.data[i] - 128) / 128;
          sum += v * v;
        }
        if (Math.sqrt(sum / a.data.length) > RMS_THRESHOLD) {
          lastLoud.set(a.id, now);
        }
        if (now - (lastLoud.get(a.id) ?? 0) < HOLD_MS) next.add(a.id);
      }
      setSpeaking((prev) => {
        if (prev.size === next.size && [...next].every((id) => prev.has(id))) {
          return prev;
        }
        return next;
      });
    }, TICK_MS);

    return () => {
      clearInterval(timer);
      ctx.close().catch(() => {});
    };
  }, [streams, enabled]);

  return speaking;
}
