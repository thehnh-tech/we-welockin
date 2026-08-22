"use client";

// One public room on the home-page feed. The whole card is the join button.

import Avatar from "@/components/Avatar";

export type FeedRoom = {
  id: string;
  name: string;
  subject: string;
  durationSec: number;
  startedAt: number;
  institution: string;
  peerCount: number;
  deep: boolean;
  peerNames: string[];
};

export default function FeedRoomCard({
  room,
  now,
  onJoin,
}: {
  room: FeedRoom;
  now: number; // ticking clock owned by the page (render purity)
  onJoin: (id: string) => void;
}) {
  const msLeft = room.startedAt + room.durationSec * 1000 - now;
  const minLeft = Math.ceil(msLeft / 60_000);

  return (
    <button
      type="button"
      onClick={() => onJoin(room.id)}
      className="wl-lift group flex flex-col gap-3 rounded-[16px] border border-hairline bg-surface p-5 text-left shadow-sm"
      aria-label={`Join ${room.name}`}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="overflow-hidden text-ellipsis whitespace-nowrap text-[16px] font-bold text-ink"
            style={{ letterSpacing: "-0.01em" }}
          >
            {room.name}
          </div>
          {room.institution && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-text3">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
              </svg>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {room.institution}
              </span>
            </div>
          )}
        </div>
        {room.deep ? (
          <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-surface">
            Deep Focus
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-card px-2.5 py-1 text-[11px] font-bold text-text2">
            <span
              className="h-[6px] w-[6px] rounded-full animate-wl-live"
              style={{ background: "#54a078" }}
              aria-hidden="true"
            />
            Live
          </span>
        )}
      </div>

      {room.subject && (
        <span className="w-fit max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-sunken px-2.5 py-1 text-[11px] font-semibold text-text2">
          {room.subject}
        </span>
      )}

      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex items-center">
          <div className="flex">
            {room.peerNames.slice(0, 4).map((name, i) => (
              <span
                key={`${name}-${i}`}
                className={i > 0 ? "-ml-2" : ""}
                style={{ zIndex: 4 - i, position: "relative" }}
              >
                <Avatar
                  username={name}
                  size={24}
                  rounded="8px"
                  ringColor="var(--wl-surface)"
                />
              </span>
            ))}
          </div>
          <span className="ml-2 text-xs font-semibold text-text2 tabular-nums">
            {room.peerCount} locked in
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-text3">
          <span className="tabular-nums">
            {minLeft > 0 ? `${minLeft} min left` : "Wrapping up"}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="transition-transform duration-200 ease-wl group-hover:translate-x-0.5"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </button>
  );
}
