import type { PeerJSOption } from "peerjs";

// Client-side WebRTC configuration, driven by NEXT_PUBLIC_* env so a deployment
// can add a TURN server (required behind symmetric NAT / strict firewalls) and
// point at a self-hosted peerjs-server without code changes. All values are
// inlined at build time.

export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ];

  // NEXT_PUBLIC_TURN_URL may be a single url or a comma-separated list.
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    const urls = turnUrl
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length) {
      servers.push({
        urls,
        username: process.env.NEXT_PUBLIC_TURN_USERNAME,
        credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
      });
    }
  }

  return servers;
}

export function buildPeerOptions(): PeerJSOption {
  const options: PeerJSOption = {
    debug: 1,
    config: { iceServers: buildIceServers() },
  };

  // Self-hosted signaling (optional). Without these, PeerJS uses its public
  // cloud broker.
  const host = process.env.NEXT_PUBLIC_PEER_HOST;
  if (host) {
    options.host = host;
    const port = process.env.NEXT_PUBLIC_PEER_PORT;
    if (port && Number.isFinite(Number(port))) options.port = Number(port);
    const path = process.env.NEXT_PUBLIC_PEER_PATH;
    if (path) options.path = path;
    const secure = process.env.NEXT_PUBLIC_PEER_SECURE;
    if (secure) options.secure = secure === "true";
  }

  return options;
}

// Human-friendly French messages for fatal PeerJS error types. Transient types
// (e.g. "peer-unavailable" when someone just left) return null = no banner.
export function peerErrorMessage(type: string | undefined): string | null {
  switch (type) {
    case "browser-incompatible":
      return "Ton navigateur ne supporte pas WebRTC. Essaie un navigateur récent.";
    case "network":
    case "socket-error":
    case "socket-closed":
      return "Connexion au serveur de signalisation perdue. Tentative de reconnexion…";
    case "server-error":
    case "ssl-unavailable":
      return "Le serveur de signalisation est indisponible. Réessaie dans un instant.";
    case "unavailable-id":
      return "Identifiant de connexion indisponible. Recharge la page.";
    case "webrtc":
      return "Erreur WebRTC. Vérifie ta connexion réseau.";
    default:
      return null;
  }
}
