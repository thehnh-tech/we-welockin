"use client";

import { avatarTint, initials, tintByKey } from "@/lib/avatar";

// Letter token tinted with the charte category palette. `tintKey` (user
// preference, broadcast in the peer status) overrides the automatic tint.
type Props = {
  username: string;
  tintKey?: string;
  size: number;
  fontSize?: number;
  rounded?: string; // CSS border-radius value
  className?: string;
  ringColor?: string; // e.g. stacked avatars on the home list
};

export default function Avatar({
  username,
  tintKey,
  size,
  fontSize,
  rounded = "11px",
  className = "",
  ringColor,
}: Props) {
  const tint = tintByKey(tintKey) ?? avatarTint(username);
  return (
    <span
      className={`flex select-none items-center justify-center font-bold ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: rounded,
        background: tint.bg,
        color: tint.fg,
        fontSize: fontSize ?? Math.round(size * 0.38),
        boxShadow: ringColor ? `0 0 0 2px ${ringColor}` : undefined,
      }}
      aria-hidden="true"
    >
      {initials(username)}
    </span>
  );
}
