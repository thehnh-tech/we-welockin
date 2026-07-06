"use client";

import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";

type Props = {
  stream: MediaStream | null;
  username: string;
  tintKey?: string;
  muted?: boolean; // mute the audio element (self, or everyone in Deep Focus)
  mirrored?: boolean;
  isLocal?: boolean;
  speaking?: boolean;
  micOff?: boolean;
  deepBadge?: boolean;
  dimmed?: boolean; // away
  compact?: boolean; // focus-mode grid
};

export default function VideoTile({
  stream,
  username,
  tintKey,
  muted = false,
  mirrored = false,
  isLocal = false,
  speaking = false,
  micOff = false,
  deepBadge = false,
  dimmed = false,
  compact = false,
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

  const showEq = speaking && !micOff;

  return (
    <div
      className={`relative overflow-hidden rounded-[14px] border-2 bg-sunken shadow-xs transition-all duration-200 ease-wl ${
        showEq ? "border-accent shadow-md" : "border-transparent"
      } ${dimmed ? "opacity-60" : ""}`}
      style={{ aspectRatio: compact ? "1 / 1" : "16 / 11" }}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full object-cover ${
          mirrored ? "scale-x-[-1]" : ""
        } ${hasVideo ? "" : "opacity-0"}`}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar
            username={username}
            tintKey={tintKey}
            size={compact ? 40 : 72}
            rounded="50%"
          />
        </div>
      )}

      {/* Top-left: Deep Focus badge (own tile). */}
      {deepBadge && !compact && (
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-hairline bg-sunken px-2.5 py-1 shadow-xs">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            style={{ stroke: "var(--wl-ink2)" }}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 18v-6a9 9 0 0118 0v6" />
            <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-text2">
            Deep Focus
          </span>
        </div>
      )}

      {/* Top-right: speaking EQ, or mic-off icon. */}
      {showEq ? (
        <div
          className="absolute right-3 top-3 flex h-[18px] items-end gap-[2px] rounded-full bg-accenttint px-[8px] py-[5px]"
          aria-label={`${username} is speaking`}
          role="img"
        >
          <span className="w-[3px] rounded-sm bg-accentink animate-wl-eq" />
          <span
            className="w-[3px] rounded-sm bg-accentink animate-wl-eq"
            style={{ animationDelay: ".2s" }}
          />
          <span
            className="w-[3px] rounded-sm bg-accentink animate-wl-eq"
            style={{ animationDelay: ".4s" }}
          />
        </div>
      ) : micOff ? (
        <div
          className="absolute right-3 top-3 flex h-[26px] w-[26px] items-center justify-center rounded-[8px]"
          style={{ background: "rgba(26,23,20,.55)" }}
          aria-label={`${username}: mic off`}
          role="img"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fffefb"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M1 1l22 22" />
            <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
            <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23" />
          </svg>
        </div>
      ) : null}

      {/* Bottom: name pill — ink overlay for contrast on video. */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-2">
        <span
          className={`max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-2.5 py-1 font-semibold ${
            compact ? "text-[10px]" : "text-xs"
          }`}
          style={{ background: "rgba(26,23,20,.72)", color: "#fffefb" }}
        >
          {username}
          {isLocal && " (you)"}
        </span>
      </div>
    </div>
  );
}
