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

No environment variables required. Just push and it works.

### Caveat: in-memory rooms store

The list of rooms is held in a `globalThis` map inside the Next.js server
process. On Vercel this means each serverless instance has its own copy, so two
users hitting different instances may not see the same room list. Joining a
room directly by URL (e.g. shared via "Inviter") still works because each
client polls the same `/api/rooms/[id]/peers` route which lives on a single
function invocation chain per request — but presence may flicker between
instances.

For a robust production setup, swap `lib/store.ts` for **Upstash Redis** or
**Vercel KV**:

- Each room → a hash with metadata + a sorted set of `peerId -> lastSeen`.
- Cleanup happens lazily on each read (drop entries older than 15s).

## Limits

- Mesh WebRTC tops out around 5-6 participants. Beyond that, switch to an SFU
  (LiveKit Cloud has a generous free tier and a drop-in React SDK).
- PeerJS's default cloud broker is rate-limited. For heavy use, self-host
  `peerjs-server` and pass `host/port/path` to `new Peer()`.
- Some users behind symmetric NATs (corporate/cellular) may fail to connect
  without TURN servers. Free TURN: [Open Relay Project](https://www.metered.ca/tools/openrelay/).
