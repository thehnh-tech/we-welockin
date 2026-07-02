// Room codes: the room id IS the code, lowercased in URLs ("focus-7q2x") and
// displayed uppercase ("FOCUS-7Q2X"). Legacy 6-char ids keep working: they
// simply display as their uppercase form.

const PREFIX = "focus-";
// Unambiguous alphabet: no i/l/o/0/1.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const SUFFIX_LEN = 4;

export function generateRoomId(): string {
  let s = "";
  for (let i = 0; i < SUFFIX_LEN; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return PREFIX + s;
}

// Accepts "FOCUS-7Q2X", "focus-7q2x", "7Q2X", " focus 7q2x " -> "focus-7q2x".
// Returns null when the input doesn't look like a code at all.
export function normalizeRoomCode(input: string): string | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (!cleaned) return null;
  const body = cleaned.startsWith(PREFIX)
    ? cleaned.slice(PREFIX.length)
    : cleaned;
  if (!/^[a-z0-9-]{2,20}$/.test(body)) return null;
  // Bare legacy ids (6 chars, no prefix typed) are used as-is.
  if (!cleaned.startsWith(PREFIX) && body.length !== SUFFIX_LEN) return body;
  return PREFIX + body;
}

export function displayRoomCode(roomId: string): string {
  return roomId.toUpperCase();
}
