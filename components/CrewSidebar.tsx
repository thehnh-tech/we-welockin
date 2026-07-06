"use client";

import { useEffect } from "react";
import Avatar from "@/components/Avatar";
import Padlock from "@/components/Padlock";
import { formatShortDuration } from "@/lib/time";
import type { RosterEntry } from "@/app/room/[id]/hooks/usePeerMesh";

type Props = {
  sessionName: string;
  subject: string;
  roster: RosterEntry[];
  myPeerId: string | null;
  now: number;
  locked: boolean; // session running -> the brand padlock is closed
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
  locked,
  collapsed,
  mobOpen,
  onCollapse,
  onCloseMobile,
  onLeave,
}: Props) {
  // Escape closes the mobile drawer (its backdrop is mouse-only).
  useEffect(() => {
    if (!mobOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMobile();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobOpen, onCloseMobile]);

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
        className={`wl-backdrop ${mobOpen ? "wl-mobopen" : ""} fixed inset-0 z-40`}
        style={{ background: "rgba(10, 8, 6, 0.45)" }}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside
        className={`wl-sidebar ${collapsed ? "wl-collapsed" : ""} ${
          mobOpen ? "wl-mobopen" : ""
        } flex h-screen flex-col overflow-hidden border-r border-bandline bg-band text-bandtext`}
        aria-label="Participants"
      >
        <div className="px-[18px] pb-4 pt-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Padlock locked={locked} size={18} />
              <span className="text-[13px] font-bold tracking-tight">
                welock<span className="text-accent">.in</span>
              </span>
            </div>
            <button
              className="wl-collapsebtn h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-bandline bg-bandchip text-bandtext2 transition-colors duration-150 hover:text-bandtext"
              onClick={onCollapse}
              aria-label={mobOpen ? "Fermer le panneau" : "Replier le panneau"}
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
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-bandtext3">
            Session
          </div>
          <div
            className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-bold"
            style={{ letterSpacing: "-0.02em" }}
          >
            {sessionName}
          </div>
          {subject && (
            <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-bandtext2">
              {subject}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-bandtext3">
            Crew · {roster.length}
          </span>
          <span className="text-[11px] font-semibold text-bandtext2">
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
                  className={`flex items-center gap-[11px] rounded-[11px] p-2 transition-colors duration-200 ease-wl ${
                    isSelf ? "bg-bandactive" : "hover:bg-bandchip"
                  }`}
                >
                  <Avatar
                    username={p.username}
                    tintKey={p.status.tint}
                    size={34}
                    rounded="11px"
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold ${
                        isSelf ? "text-bandactivetext" : "text-bandtext"
                      }`}
                    >
                      {p.username}
                      {isSelf && " (toi)"}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: away
                            ? "rgba(160, 152, 140, .8)"
                            : "#54a078",
                        }}
                        aria-hidden="true"
                      />
                      <span
                        className={`text-[11px] font-medium ${
                          isSelf ? "text-bandactivetext" : "text-bandtext2"
                        }`}
                        style={isSelf ? { opacity: 0.65 } : undefined}
                      >
                        {away
                          ? "Absent"
                          : p.status.deep
                            ? "Deep Focus"
                            : "Étudie"}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-semibold tabular-nums ${
                      isSelf ? "text-bandactivetext" : "text-bandtext2"
                    }`}
                    style={isSelf ? { opacity: 0.75 } : undefined}
                  >
                    {formatShortDuration((now - p.joinedAt) / 1000)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-bandline px-[18px] pb-[18px] pt-3">
          <button
            onClick={onLeave}
            className="wl-band-danger flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-[13px] font-semibold text-bandtext2 transition-colors duration-150"
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
            Quitter la session
          </button>
        </div>
      </aside>
    </>
  );
}
