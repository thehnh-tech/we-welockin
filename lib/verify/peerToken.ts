// Proof that you are the peer you claim to be inside a room.
//
// A room's presence entries are keyed by a PeerJS id, and every member sees
// every other member's id — the mesh needs them to place calls. Without a
// proof, that shared knowledge is enough to overwrite someone's roster entry
// or to evict them, because both operations only ever asked for the id.
//
// So the first announce for a peer id mints a token, returned only to that
// caller. Re-announcing an id that is already in the room, or removing it,
// requires presenting the token back. It is a deterministic HMAC of the pair,
// so nothing has to be stored: the server can always recompute it, and nobody
// else can forge it without AUTH_SECRET.

import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "./token";

export function signPeerToken(
  roomId: string,
  peerId: string,
  secret: string = getAuthSecret()
): string {
  return createHmac("sha256", secret)
    .update(`peer:${roomId}:${peerId}`)
    .digest("base64url");
}

export function verifyPeerToken(
  roomId: string,
  peerId: string,
  token: string | undefined | null,
  secret: string = getAuthSecret()
): boolean {
  if (!token || token.length > 256) return false;
  const expected = Buffer.from(signPeerToken(roomId, peerId, secret), "utf8");
  const got = Buffer.from(token, "utf8");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
