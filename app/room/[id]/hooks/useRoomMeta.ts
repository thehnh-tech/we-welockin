import { useEffect, useState } from "react";
import { parseRoomParams } from "@/lib/roomLink";

export type RoomMeta = { name: string; durationSec: number; startedAt: number };

// Resolve room metadata: trust the deep-link params first, otherwise ask the
// server (works for bare links shared during a presence gap).
export function useRoomMeta(
  roomId: string | undefined,
  n: string | null,
  d: string | null,
  s: string | null
): { room: RoomMeta | null; roomError: string | null } {
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const fromUrl = parseRoomParams({ n, d, s });
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
              "Lien incomplet et room inconnue. Demande un lien complet à l'organisateur."
            );
          return;
        }
        const data = await res.json();
        if (alive && data.room) {
          setRoom({
            name: data.room.name,
            durationSec: data.room.durationSec,
            startedAt: data.room.startedAt,
          });
        }
      } catch {
        if (alive) setRoomError("Erreur réseau.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [roomId, n, d, s]);

  return { room, roomError };
}
