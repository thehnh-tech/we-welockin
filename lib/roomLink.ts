// The single source of truth for the room deep-link contract (?n & d & s).
// Used by the home page to build links and by the room page to read them.

export type RoomLinkMeta = {
  id: string;
  name: string;
  durationSec: number;
  startedAt: number;
};

export function buildRoomUrl(meta: RoomLinkMeta): string {
  const qs = new URLSearchParams({
    n: meta.name,
    d: String(meta.durationSec),
    s: String(meta.startedAt),
  }).toString();
  return `/room/${encodeURIComponent(meta.id)}?${qs}`;
}

export type ParsedRoomParams = {
  name: string;
  durationSec: number;
  startedAt: number;
};

// Parse the optional deep-link params. Returns null when absent or invalid, so
// the caller falls back to asking the server.
export function parseRoomParams(params: {
  n: string | null;
  d: string | null;
  s: string | null;
}): ParsedRoomParams | null {
  if (params.n === null || params.d === null || params.s === null) return null;
  const durationSec = parseInt(params.d, 10);
  const startedAt = parseInt(params.s, 10);
  if (
    !Number.isFinite(durationSec) ||
    !Number.isFinite(startedAt) ||
    durationSec < 60
  ) {
    return null;
  }
  return {
    name: decodeURIComponent(params.n) || "Study session",
    durationSec,
    startedAt,
  };
}
