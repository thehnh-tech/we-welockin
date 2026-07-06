import { useEffect, useState } from "react";

// Acquire the local camera/mic (when enabled) and expose mute/cam toggles.
// Owns the stream lifecycle: stops all tracks on cleanup.
export function useLocalMedia(enabled: boolean): {
  localStream: MediaStream | null;
  mediaError: string | null;
  muted: boolean;
  camOff: boolean;
  toggleMute: () => void;
  toggleCam: () => void;
} {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });
      } catch (e) {
        if (!cancelled) {
          const name = e instanceof DOMException ? e.name : "";
          setMediaError(
            name === "NotAllowedError" || name === "SecurityError"
              ? "Permission denied. Allow camera and microphone access."
              : name === "NotFoundError" || name === "DevicesNotFoundError"
                ? "No camera or microphone found."
                : name === "NotReadableError"
                  ? "Your camera or mic is in use by another app."
                  : "Couldn't access your camera or mic."
          );
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setLocalStream(stream);
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    };
  }, [enabled]);

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

  return { localStream, mediaError, muted, camOff, toggleMute, toggleCam };
}
