import { useEffect, useState } from "react";

export type RoomMeta = {
  name: string;
  subject: string;
  durationSec: number;
  startedAt: number;
  visibility: "public" | "private";
  institution: string; // "" when none
};

// Room metadata comes from the server, always. It used to be readable from
// query parameters on the link, which meant a crafted link could describe a
// room that did not exist, or misdescribe one that did — the timer and the
// name were whatever the URL said. Rooms are now created server-side and the
// link carries nothing but the id, so there is a single source of truth.
export function useRoomMeta(roomId: string | undefined): {
  room: RoomMeta | null;
  roomError: string | null;
} {
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!alive) return;
          setRoomError(
            res.status === 429
              ? "Too many requests from your network right now. Try again in a minute."
              : "This room has ended, or the code is wrong. Ask your crew for a fresh link."
          );
          return;
        }
        const data = await res.json();
        if (!alive || !data.room) return;
        setRoom({
          name: data.room.name,
          subject: data.room.subject ?? "",
          durationSec: data.room.durationSec,
          startedAt: data.room.startedAt,
          visibility: data.room.visibility === "public" ? "public" : "private",
          institution:
            typeof data.room.institution === "string"
              ? data.room.institution
              : "",
        });
      } catch {
        if (alive) setRoomError("Network error.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [roomId]);

  return { room, roomError };
}
