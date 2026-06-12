"use client";

import { useEffect, useRef } from "react";

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

  useEffect(() => {
    if (ref.current && stream) {
      if (ref.current.srcObject !== stream) {
        ref.current.srcObject = stream;
      }
    }
  }, [stream]);

  const hasVideo =
    stream?.getVideoTracks().some((t) => t.enabled && t.readyState === "live") ??
    false;

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
