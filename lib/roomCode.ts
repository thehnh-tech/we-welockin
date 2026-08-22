// Room codes: the room id IS the code, lowercased in URLs ("7q2xkm") and
// displayed uppercase ("7Q2XKM").
//
// For a private room the code is the ONLY thing standing between a stranger
// and the session, so it has to resist guessing: 6 characters over a 31-letter
// alphabet is 31^6 ≈ 887 million combinations.
//
// Length alone is not the defence — an unmetered lookup endpoint would let an
// attacker walk that space at network speed. What makes it hold is that BOTH
// the room lookup and the announce are rate limited per IP (see
// lib/store/index.ts): finding one specific room takes millennia, and
// stumbling onto any live room at all takes weeks of conspicuous traffic.
// Removing either limiter silently invalidates this whole paragraph.
//
// Older ids keep working unchanged: the "focus-xxxxx" form minted by previous
// versions, and the bare 6-character ids from before that.

const LEGACY_PREFIX = "focus-";
// Unambiguous alphabet: no i/l/o/0/1, so a code read aloud or copied off a
// screen cannot be mistyped into someone else's room.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LEN = 6;

export function generateRoomId(): string {
  const idx = new Uint32Array(CODE_LEN);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(idx);
  } else {
    for (let i = 0; i < CODE_LEN; i++) {
      idx[i] = Math.floor(Math.random() * ALPHABET.length);
    }
  }
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) {
    // 2^32 is not a multiple of 31, so the modulo is very slightly biased
    // toward the first characters. At this alphabet size the skew is ~1e-8 —
    // far below anything that helps a guesser.
    s += ALPHABET[idx[i] % ALPHABET.length];
  }
  return s;
}

// Accepts "7Q2XKM", "7q2xkm", " 7q2 xkm ", and the legacy "FOCUS-7Q2XZ".
// Returns null when the input doesn't look like a code at all.
export function normalizeRoomCode(input: string): string | null {
  const cleaned = input.trim().toLowerCase();
  if (!cleaned) return null;

  // Legacy ids carry the prefix in the stored id, so it must be preserved for
  // the lookup to find the room.
  const spaced = cleaned.replace(/[\s_]+/g, "-");
  if (spaced.startsWith(LEGACY_PREFIX)) {
    const body = spaced.slice(LEGACY_PREFIX.length);
    return /^[a-z0-9]{2,20}$/.test(body) ? LEGACY_PREFIX + body : null;
  }

  // Current form: separators are cosmetic, strip them all.
  const body = cleaned.replace(/[\s_-]+/g, "");
  return /^[a-z0-9]{2,20}$/.test(body) ? body : null;
}

export function displayRoomCode(roomId: string): string {
  return roomId.toUpperCase();
}
