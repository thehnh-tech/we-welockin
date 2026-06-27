"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  stream: MediaStream | null;
  username: string;
  muted?: boolean;
  mirrored?: boolean;
  isLocal?: boolean;
};

export default function VideoTile({
  stream,
  username,
  muted = false,
  mirrored = false,
  isLocal = false,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  // Bumped on track mute/unmute/ended so `hasVideo` (derived below) is
  // recomputed — a remote peer toggling their camera only surfaces through
  // these events, never through a prop change.
  const [, bump] = useState(0);

  useEffect(() => {
    if (ref.current && stream) {
      if (ref.current.srcObject !== stream) {
        ref.current.srcObject = stream;
      }
    }
  }, [stream]);

  useEffect(() => {
    if (!stream) return;
    const rerender = () => bump((n) => n + 1);
    const tracks = stream.getVideoTracks();
    for (const t of tracks) {
      t.addEventListener("mute", rerender);
      t.addEventListener("unmute", rerender);
      t.addEventListener("ended", rerender);
    }
    stream.addEventListener("addtrack", rerender);
    stream.addEventListener("removetrack", rerender);
    return () => {
      for (const t of tracks) {
        t.removeEventListener("mute", rerender);
        t.removeEventListener("unmute", rerender);
        t.removeEventListener("ended", rerender);
      }
      stream.removeEventListener("addtrack", rerender);
      stream.removeEventListener("removetrack", rerender);
    };
  }, [stream]);

  // `enabled` covers the local case (we flip it when toggling our own camera);
  // `!muted` covers the remote case (the receiver's track goes muted when the
  // sender disables theirs, while `enabled` stays true).
  const hasVideo =
    stream
      ?.getVideoTracks()
      .some((t) => t.enabled && !t.muted && t.readyState === "live") ?? false;

  return (
    <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10 shadow-lg">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover ${
          mirrored ? "scale-x-[-1]" : ""
        } ${hasVideo ? "" : "opacity-0"}`}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center text-white/40">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold">
            {username.slice(0, 1).toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 px-2 py-0.5 text-xs bg-black/60 rounded backdrop-blur-sm">
        {username}
        {isLocal && " (toi)"}
      </div>
    </div>
  );
}
