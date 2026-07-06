import { useEffect, useState } from "react";
import { parseRoomParams } from "@/lib/roomLink";

export type RoomMeta = {
  name: string;
  subject: string;
  durationSec: number;
  startedAt: number;
};

// Resolve room metadata: trust the deep-link params first, otherwise ask the
// server (works for bare links / room codes shared without params).
export function useRoomMeta(
  roomId: string | undefined,
  n: string | null,
  d: string | null,
  s: string | null,
  sub: string | null
): { room: RoomMeta | null; roomError: string | null } {
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    // Defense in depth: a malformed deep link must degrade to the server
    // lookup, never crash the room.
    let fromUrl = null;
    try {
      fromUrl = parseRoomParams({ n, d, s, sub });
    } catch {}
    if (fromUrl) {
      setRoom(fromUrl);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
        if (!res.ok) {
          if (alive)
            setRoomError(
              "This room doesn't exist. Check the code, or ask the host for a fresh link."
            );
          return;
        }
        const data = await res.json();
        if (alive && data.room) {
          setRoom({
            name: data.room.name,
            subject: data.room.subject ?? "",
            durationSec: data.room.durationSec,
            startedAt: data.room.startedAt,
          });
        }
      } catch {
        if (alive) setRoomError("Network error.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [roomId, n, d, s, sub]);

  return { room, roomError };
}
