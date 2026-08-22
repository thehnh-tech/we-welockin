# WeLockInStudy

Video study rooms with a shared focus timer. Next.js + WebRTC mesh via PeerJS.

## How it works

- **Pseudo** stored in cookie on first visit.
- **Home** lets you create a room (name + timer minutes) and shows the
  **public feed** of live rooms started by verified university students.
- **Private rooms** (default) are joinable by code/link only — no account, no
  verification, zero friction.
- **Public rooms** appear on the feed for everyone to join, so creating one
  requires verifying a **university email** (see below). Joining stays open to
  all.
- **Room** opens your camera/mic and connects you peer-to-peer with everyone
  else. The timer runs in the center, synced from the server's `startedAt`.
- **Video** uses [PeerJS](https://peerjs.com/) with a mesh topology (each peer
  calls every other peer). PeerJS's free public cloud handles signaling, so the
  app stays fully serverless-friendly on Vercel.
- **Peer presence** is announced every 4s via simple REST endpoints — no
  WebSocket server needed.

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

Mutating routes (`POST /api/rooms`, `POST /api/rooms/[id]/peers`) are body-size
capped and rate-limited per IP by whichever shared store is configured — Redis
or MongoDB. With neither (in-memory dev), the limiter is a no-op. Public-room
creation is additionally capped per verified account, and the verification
endpoints carry their own per-IP and per-email limits.

## Limits

- Mesh WebRTC tops out around 5-6 participants. Beyond that, switch to an SFU
  (LiveKit Cloud has a generous free tier and a drop-in React SDK).
- PeerJS's default cloud broker is rate-limited. For heavy use, self-host
  `peerjs-server` and set `NEXT_PUBLIC_PEER_HOST/PORT/PATH/SECURE` (see
  `.env.example`); they feed `lib/rtc-config.ts`.
- Some users behind symmetric NATs (corporate/cellular) fail to connect with
  STUN alone. Set `NEXT_PUBLIC_TURN_URL/USERNAME/CREDENTIAL` to add a TURN
  server — free credentials at the
  [Open Relay Project](https://www.metered.ca/tools/openrelay/). The room shows
  a hint banner if others are present but no media connection establishes.
