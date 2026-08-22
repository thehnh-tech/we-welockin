# WeLockInStudy

Video study rooms with a shared focus timer. Next.js + WebRTC mesh via PeerJS.

## How it works

- **Pseudo** stored in cookie on first visit.
- **Home** lets you create a room (name + timer minutes) and shows the
  **public feed** of live rooms started by verified university students.
- **Private rooms** (default) are joinable by code/link only — no account, no
  verification, zero friction. The code *is* the credential: six characters
  over a 31-letter alphabet (`7Q2XKM`), which is ~887M combinations.
- **Public rooms** are listed on the feed, so **both creating and joining one
  require a verified university email** (see below). The check is enforced
  server-side on every announce, reading the room's *stored* visibility — a
  client that lies about it in the request body changes nothing.
- **Every room seats 6.** That is the real ceiling of a WebRTC mesh (each peer
  streams to every other), so it is enforced and shown, not aspirational: the
  feed displays `3/6`, a full room is not joinable, and the 7th person gets a
  clear answer instead of a silently broken call.
- **Room** opens your camera/mic and connects you peer-to-peer with everyone
  else. The timer runs in the center, synced from the server's `startedAt`.
- **Video** uses [PeerJS](https://peerjs.com/) with a mesh topology (each peer
  calls every other peer). PeerJS's free public cloud handles signaling, so the
  app stays fully serverless-friendly on Vercel.
- **Peer presence** is announced every 4s via simple REST endpoints — no
  WebSocket server needed. The heartbeat carries presence only; a room's
  identity is fixed at creation and read from the store.

## University verification & the public feed

Creating a public room is gated server-side:

1. `POST /api/verify/request` checks the address against the
   [glean/university-email-domains](https://github.com/glean/university-email-domains)
   dataset (7.7k institutions, subdomains matched — `student.epfl.ch` counts
   as `epfl.ch`) and emails a 6-digit code via [Resend](https://resend.com).
   Personal providers (gmail & co) are rejected outright; unknown domains get
   a **"Request your institution"** flow (`POST /api/institutions/request` —
   recorded in MongoDB + emailed to `INSTITUTION_REQUESTS_TO`).
2. `POST /api/verify/confirm` checks the code (10-min TTL, 5 attempts,
   constant-time compare) and sets a signed httpOnly cookie
   (HMAC-SHA256 with `AUTH_SECRET`, 30 days).
3. `POST /api/rooms` only accepts `visibility: "public"` with that cookie; the
   room is labeled with the institution on the feed. The implicit
   create-on-first-announce path force-downgrades to private without it
   (`sanitizeVisibility` is fail-closed).
4. `POST /api/rooms/[id]/peers` refuses (403 `verification_required`) when the
   stored room is public and the caller has no valid cookie — so a public
   room's *link* is not a way around the check. The room page turns that into
   an inline verification step rather than a dead end.

Codes, verified emails, institution requests, rate limits and the feed archive
live in **MongoDB** (TTL indexes). Local dev works with zero env vars: codes
are printed to the dev-server console and state falls back in-process.

The dataset is checked in (`lib/university/domains.json`); refresh it with
`npm run build:domains`.

## Local dev

```bash
npm install
npm run dev
```

Open http://localhost:3000.

For the video to work across machines on your LAN you need HTTPS (browsers
require a secure context for camera/mic). On `localhost` it works as-is. To
test with friends, deploy to Vercel.

## Deploy on Vercel

```bash
npx vercel
```

Works with no env vars (in-memory fallback), but for a real deployment set up
the shared store below.

### Rooms store: in-memory fallback vs Redis vs MongoDB

The store lives behind a small async adapter (`lib/store/`) with three
backends, selected automatically at startup (**Redis > MongoDB > memory**):

- **In-memory** (`memory.ts`) — used when nothing is configured. A
  `globalThis` map inside the Next.js process. Fine for local dev / a single
  long-lived instance, but on Vercel each serverless instance has its own copy,
  so two users on different instances may not discover each other.
- **Redis** (`redis.ts`) — used when Upstash/KV credentials are set. Shared
  across all instances, so discovery and presence are correct in production.
  Schema (prefix `wlis:`): `room:{id}` hash (metadata, TTL), `room:{id}:peers`
  sorted set `peerId -> lastSeen` (TTL), `room:{id}:names` hash, and a global
  `rooms` sorted set for discovery. Stale peers are dropped lazily on each read
  (older than 30s); abandoned rooms expire via key TTL.
- **MongoDB** (`mongo.ts`) — used when `MONGODB_URI` is set (and Redis is
  not). `rooms` + `room_peers` collections with TTL indexes; same semantics as
  the Redis backend. Handy because MongoDB is required for the verification
  features anyway — one database can run the whole thing.

Copy `.env.example` to `.env.local` and fill in what you use. On Vercel, add
the same vars in the project settings.

### Room access model

Who may do what, and what enforces it:

| | Private room | Public room |
|---|---|---|
| Find it | code only (never listed) | listed on the feed |
| Create | anyone | verified university email |
| Join | anyone with the code | verified university email |
| Seats | 6 | 6 |

**Rooms are ephemeral, and creation is centralized.** `POST /api/rooms` is the
only way a room comes into existence, and it mints the id — a caller cannot
choose one. A heartbeat to an unknown id is a 404, never a new room. So a room
still vanishes when everyone leaves (TTL ~120s, refreshed by heartbeats), but
its link dies with it instead of quietly reopening as somebody else's room at
the same address. Links carry nothing but the id: no name, no timer, no
visibility, so a crafted link cannot describe a room into existence or
misdescribe a real one.

The three properties worth knowing:

- **The code is the credential** for a private room, so guessing it must be
  expensive. It is 6 characters over a 31-letter alphabet (~887M), and *both*
  the room lookup and the announce are rate-limited per IP — a code this short
  is only safe while those limiters exist.
- **A public room's link is not a bypass.** `POST /api/rooms/[id]/peers`
  re-reads the room's *stored* visibility and answers 403 without a valid
  cookie, so forging `visibility` in the request body changes nothing.
- **A peer id is not proof of identity.** Every member sees every other
  member's id (the mesh needs them to place calls), so the first announce
  mints a per-peer HMAC token; re-announcing an id already in the room, or
  removing it, requires that token. Without this, any member could take over
  another's roster entry or kick them, and anyone with the code could do it
  from outside.

Mutating routes are body-size capped; room ids are restricted to
`[a-z0-9-]` before they reach a storage key. Room creation carries a tight
per-IP budget of its own (it consumes a slot in the global room cap) and an
extra per-account one for public rooms; the verification endpoints have their
own per-IP and per-email limits. Security headers (`frame-ancestors 'none'`,
a `Permissions-Policy` confining camera/mic to this origin, `nosniff`,
`strict-origin-when-cross-origin` so a room URL never leaks in a `Referer`,
and `no-store` on the API) are set in `next.config.mjs`.

## Limits

- Mesh WebRTC tops out around 5-6 participants, which is why `ROOM_CAPACITY`
  (`lib/store/sanitize.ts`) is 6. Raising it without moving to an SFU
  (LiveKit Cloud has a generous free tier and a drop-in React SDK) degrades
  the call for everyone in the room.
- PeerJS's default cloud broker is rate-limited. For heavy use, self-host
  `peerjs-server` and set `NEXT_PUBLIC_PEER_HOST/PORT/PATH/SECURE` (see
  `.env.example`); they feed `lib/rtc-config.ts`.
- Some users behind symmetric NATs (corporate/cellular) fail to connect with
  STUN alone. Set `NEXT_PUBLIC_TURN_URL/USERNAME/CREDENTIAL` to add a TURN
  server — free credentials at the
  [Open Relay Project](https://www.metered.ca/tools/openrelay/). The room shows
  a hint banner if others are present but no media connection establishes.
