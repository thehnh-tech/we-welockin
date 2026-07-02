"use client";

import { avatarColor, initials } from "@/lib/avatar";
import { formatDuration } from "@/lib/time";
import type { RosterEntry } from "@/app/room/[id]/hooks/usePeerMesh";

type Props = {
  sessionName: string;
  subject: string;
  roster: RosterEntry[];
  myPeerId: string | null;
  now: number;
  collapsed: boolean;
  mobOpen: boolean;
  onCollapse: () => void;
  onCloseMobile: () => void;
  onLeave: () => void;
};

export default function CrewSidebar({
  sessionName,
  subject,
  roster,
  myPeerId,
  now,
  collapsed,
  mobOpen,
  onCollapse,
  onCloseMobile,
  onLeave,
}: Props) {
  // Self first, then by arrival.
  const sorted = [...roster].sort((a, b) => {
    if (a.peerId === myPeerId) return -1;
    if (b.peerId === myPeerId) return 1;
    return a.joinedAt - b.joinedAt;
  });
  const focusedCount = roster.filter((p) => !p.status.away).length;

  return (
    <>
      <div
        className={`wl-backdrop ${mobOpen ? "wl-mobopen" : ""} fixed inset-0 z-40 bg-black/55`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside
        className={`wl-sidebar ${collapsed ? "wl-collapsed" : ""} ${
          mobOpen ? "wl-mobopen" : ""
        } flex h-screen flex-col overflow-hidden border-r border-line bg-panel`}
        aria-label="Participants"
      >
        <div className="px-[18px] pb-4 pt-5">
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-accent text-[13px] font-extrabold">
                W
              </div>
              <span className="text-[13px] font-bold tracking-wide text-zinc-200">
                WeLockIn
              </span>
            </div>
            <button
              className="wl-collapsebtn h-[30px] w-[30px] items-center justify-center rounded-lg border border-line2 bg-transparent text-zinc-400 hover:bg-line hover:text-white"
              onClick={onCollapse}
              aria-label="Replier le panneau"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.12em] text-zinc-600">
            Session
          </div>
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-bold text-white">
            {sessionName}
          </div>
          {subject && (
            <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-zinc-500">
              {subject}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-zinc-600">
            Crew · {roster.length}
          </span>
          <span className="text-[11px] font-semibold text-indigo-400">
            {focusedCount} en focus
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          <ul className="flex list-none flex-col gap-1 p-0" aria-label="Crew">
            {sorted.map((p) => {
              const isSelf = p.peerId === myPeerId;
              const away = p.status.away;
              return (
                <li
                  key={p.peerId}
                  className={`flex items-center gap-[11px] rounded-xl border p-2 ${
                    isSelf
                      ? "border-indigo-500/25 bg-indigo-500/10"
                      : "border-transparent"
                  }`}
                >
                  <div
                    className="flex h-[34px] w-[34px] min-w-[34px] items-center justify-center rounded-xl text-[13px] font-bold text-white"
                    style={{ background: avatarColor(p.username) }}
                    aria-hidden="true"
                  >
                    {initials(p.username)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-zinc-200">
                      {p.username}
                      {isSelf && " (toi)"}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: away ? "#a1a1aa" : "#6366f1" }}
                        aria-hidden="true"
                      />
                      <span className="text-[11px] font-medium text-zinc-500">
                        {away
                          ? "Absent"
                          : p.status.deep
                            ? "Deep Focus"
                            : "Étudie"}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      isSelf ? "text-indigo-400" : "text-zinc-500"
                    }`}
                  >
                    {formatDuration((now - p.joinedAt) / 1000)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-line px-[18px] pb-[18px] pt-3">
          <button
            onClick={onLeave}
            className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-[13px] font-semibold text-zinc-400 hover:bg-red-400/10 hover:text-red-400"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Quitter
          </button>
        </div>
      </aside>
    </>
  );
}
