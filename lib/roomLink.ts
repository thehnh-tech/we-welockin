// The single source of truth for the room deep-link contract (?n & d & s & sub).
// Used by the home page to build links and by the room page to read them.

export type RoomLinkMeta = {
  id: string;
  name: string;
  durationSec: number;
  startedAt: number;
  subject?: string;
};

export function buildRoomUrl(meta: RoomLinkMeta): string {
  const params: Record<string, string> = {
    n: meta.name,
    d: String(meta.durationSec),
    s: String(meta.startedAt),
  };
  if (meta.subject) params.sub = meta.subject;
  const qs = new URLSearchParams(params).toString();
  return `/room/${encodeURIComponent(meta.id)}?${qs}`;
}

export type ParsedRoomParams = {
  name: string;
  durationSec: number;
  startedAt: number;
  subject: string;
};

// Parse the optional deep-link params. Returns null when absent or invalid, so
// the caller falls back to asking the server.
//
// NOTE: values arrive ALREADY percent-decoded (useSearchParams().get() /
// URLSearchParams.get() decode) — do not decode again, a second
// decodeURIComponent throws URIError on legitimate "%" in names. Lengths are
// clamped to the server-side limits so a forged oversized URL cannot push the
// announce payload past the request-body cap.
export function parseRoomParams(params: {
  n: string | null;
  d: string | null;
  s: string | null;
  sub?: string | null;
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
    name: (params.n || "Study session").slice(0, 60),
    durationSec,
    startedAt,
    subject: (params.sub ?? "").slice(0, 60),
  };
}
