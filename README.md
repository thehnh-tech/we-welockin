# WeLockInStudy

Video study rooms with a shared focus timer. Next.js + WebRTC mesh via PeerJS.

## How it works

- **Pseudo** stored in cookie on first visit.
- **Home** lists public rooms and lets you create one (name + timer minutes).
- **Room** opens your camera/mic and connects you peer-to-peer with everyone else.
  The timer runs in the center, synced from the server's `startedAt`.
- **Video** uses [PeerJS](https://peerjs.com/) with a mesh topology (each peer
  calls every other peer). PeerJS's free public cloud handles signaling, so the
  app stays fully serverless-friendly on Vercel.
- **Peer presence** is announced every 5s and polled every 3s via simple REST
  endpoints — no WebSocket server needed.

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

### Rooms store: in-memory fallback vs Redis

The store lives behind a small async adapter (`lib/store/`) with two backends,
selected automatically at startup:

- **In-memory** (`memory.ts`) — used when no Redis credentials are present. A
  `globalThis` map inside the Next.js process. Fine for local dev / a single
  long-lived instance, but on Vercel each serverless instance has its own copy,
  so two users on different instances may not discover each other.
- **Redis** (`redis.ts`) — used when Upstash/KV credentials are set. Shared
  across all instances, so discovery and presence are correct in production.
  Schema (prefix `wlis:`): `room:{id}` hash (metadata, TTL), `room:{id}:peers`
  sorted set `peerId -> lastSeen` (TTL), `room:{id}:names` hash, and a global
  `rooms` sorted set for discovery. Stale peers are dropped lazily on each read
  (older than 30s); abandoned rooms expire via key TTL.

To enable Redis, copy `.env.example` to `.env.local` and fill in a free
[Upstash](https://upstash.com) database's REST URL + token (Vercel KV names
also work). On Vercel, add the same vars in the project settings.

Mutating routes (`POST`/`DELETE /api/rooms/[id]/peers`) are body-size capped and
rate-limited per IP when Redis is configured.

## Limits

- Mesh WebRTC tops out around 5-6 participants. Beyond that, switch to an SFU
  (LiveKit Cloud has a generous free tier and a drop-in React SDK).
- PeerJS's default cloud broker is rate-limited. For heavy use, self-host
  `peerjs-server` and pass `host/port/path` to `new Peer()`.
- Some users behind symmetric NATs (corporate/cellular) may fail to connect
  without TURN servers. Free TURN: [Open Relay Project](https://www.metered.ca/tools/openrelay/).
