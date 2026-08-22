// Shared constants + input sanitization used by every store backend, so the
// in-memory and Redis paths enforce identical limits and clamps.

export const PEER_TIMEOUT_MS = 30_000; // a peer is stale after this without a heartbeat
export const ROOM_TTL_SEC = 120; // Redis key TTL, refreshed on each announce
export const ROOM_GRACE_MS = 120_000; // keep an empty room (in-memory) this long
export const MAX_ROOMS = 500; // global cap (DoS guard)
export const MAX_PEERS_PER_ROOM = 20; // per-room cap (mesh tops out ~6 anyway)
export const MAX_LIST_ROOMS = 100; // cap the discovery scan
export const DEFAULT_DURATION_SEC = 1500; // 25 min

// Strip C0 control chars + DEL — defense against display/log injection in
// attacker-controlled names that get broadcast to other peers. Built via
// RegExp() to avoid embedding raw control characters in the source.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

export function sanitizeName(name: string | undefined): string {
  return (
    (name ?? "").toString().replace(CONTROL_CHARS, "").trim().slice(0, 60) ||
    "Study session"
  );
}

export function sanitizeUsername(username: string | undefined): string {
  return (
    (username ?? "").toString().replace(CONTROL_CHARS, "").trim().slice(0, 30) ||
    "Anon"
  );
}

// Unlike the name, an empty subject is fine.
export function sanitizeSubject(subject: string | undefined): string {
  return (subject ?? "").toString().replace(CONTROL_CHARS, "").trim().slice(0, 60);
}

// Fail-closed: anything that isn't explicitly "public" is private. The API
// routes only pass "public" after checking the verified-university cookie.
export function sanitizeVisibility(v: unknown): "public" | "private" {
  return v === "public" ? "public" : "private";
}

// University display name, set server-side from the verified cookie.
export function sanitizeInstitution(v: unknown): string {
  return (v ?? "").toString().replace(CONTROL_CHARS, "").trim().slice(0, 120);
}

const TINT_KEYS = new Set([
  "bleu",
  "rose",
  "vert",
  "violet",
  "ambre",
  "sable",
  "sarcelle",
]);

export function sanitizeStatus(status: unknown): {
  muted: boolean;
  away: boolean;
  deep: boolean;
  tint: string;
} {
  const s = (status ?? {}) as Record<string, unknown>;
  return {
    muted: s.muted === true,
    away: s.away === true,
    deep: s.deep === true,
    tint: typeof s.tint === "string" && TINT_KEYS.has(s.tint) ? s.tint : "",
  };
}

export function sanitizeDuration(durationSec: number | undefined): number {
  const v = Math.floor(durationSec ?? DEFAULT_DURATION_SEC);
  return Number.isFinite(v)
    ? Math.max(60, Math.min(8 * 3600, v))
    : DEFAULT_DURATION_SEC;
}

// Clamp into [now - durationSec, now]: never in the future, never so far in the
// past that the timer is nonsensically negative.
export function sanitizeStartedAt(
  startedAt: number | undefined,
  durationSec: number,
  now: number
): number {
  const v = Math.floor(startedAt ?? now);
  return Number.isFinite(v)
    ? Math.min(now, Math.max(now - durationSec * 1000, v))
    : now;
}

export function sanitizePeerId(peerId: string | undefined): string {
  return (peerId ?? "").toString().slice(0, 64);
}

export function sanitizeRoomId(roomId: string | undefined): string {
  return (roomId ?? "").toString().slice(0, 64);
}
