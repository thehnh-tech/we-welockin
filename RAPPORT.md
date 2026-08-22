# Rapport technique — WeLockInStudy

> État au 27 juin 2026 · branche `main` · 2 commits · `tsc --noEmit` ✅ propre

---

## 1. C'est quoi le projet

**WeLockInStudy** est une web app de **salles d'étude en visio avec un minuteur de focus partagé** (style Pomodoro / « lock in »). On choisit un pseudo, on crée ou rejoint une *room*, sa caméra/micro s'ouvrent, et tout le monde voit un compte à rebours synchronisé au centre de l'écran pour bosser ensemble.

Le parti pris technique fort : **zéro serveur de média et zéro serveur de signalisation à gérer**. La vidéo passe en **WebRTC peer-to-peer (topologie mesh)** via **PeerJS**, qui s'appuie sur son broker cloud public gratuit pour la signalisation. Résultat : l'app se déploie telle quelle sur Vercel, sans variable d'environnement ni backend dédié.

C'est un **MVP fonctionnel** : le cœur (pseudo → liste/création de rooms → visio mesh + timer synchro + contrôles micro/cam) marche de bout en bout. Ce qui reste relève surtout de la **robustesse en production** et de l'**enrichissement fonctionnel**.

---

## 2. Stack technique

| Brique | Choix | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.9 |
| UI | React | 18.3.1 |
| Vidéo P2P | PeerJS (WebRTC mesh) | 1.5.4 |
| Styles | Tailwind CSS | 3.4.15 |
| Langage | TypeScript | 5.5.3 |
| Hébergement cible | Vercel (serverless) | — |

Pas de base de données, pas de state management externe, pas de lib UI. Tout est en composants clients (`"use client"`).

---

## 3. Architecture

### Vue d'ensemble du flux

```
Navigateur A ──┐                          ┌── Navigateur B
   getUserMedia │   signalisation PeerJS   │ getUserMedia
   PeerJS  ◄────┼───  (broker cloud)  ─────┼────► PeerJS
   │            │                          │
   └─ flux vidéo/audio WebRTC DIRECT (mesh) ─┘
        (chaque pair appelle tous les autres)

Présence / liste de rooms  ──►  API routes Next.js  ──►  store en mémoire (globalThis)
   announce POST /5s
   poll    GET  /3s
```

Deux canaux indépendants :

1. **Les médias** (vidéo/audio) ne transitent **jamais** par le serveur Next.js — ils vont en direct de pair à pair, négociés par PeerJS via le broker public et les serveurs STUN de Google/Twilio.
2. **La présence** (qui est dans quelle room) passe par de simples routes REST Next.js qui écrivent dans un store en mémoire. Pas de WebSocket : c'est du **polling** (toutes les 3s) + **heartbeat** (toutes les 5s).

### Frontend

| Fichier | Rôle |
|---|---|
| `app/page.tsx` (215 l.) | Accueil : saisie du pseudo, liste des rooms publiques (poll 4s), formulaire de création. La création génère un `shortId` de 6 caractères et redirige vers la room avec les métadonnées en query params (`n`, `d`, `s`). |
| `app/room/[id]/page.tsx` (467 l.) | **Cœur de l'app.** Résout les métadonnées de la room (query params d'abord, fallback serveur), ouvre la caméra/micro, monte le mesh PeerJS, gère présence/heartbeat, contrôles micro/cam, lien d'invitation, et tout le nettoyage au départ. |
| `components/Timer.tsx` (68 l.) | Minuteur circulaire en SVG. Calcule le restant à partir de `startedAt + durationSec` → **synchro pour tous** sans état partagé. Affiche « Terminé » à la fin. |
| `components/VideoTile.tsx` (58 l.) | Tuile vidéo (mirror pour le local, fallback avatar-initiale si pas de flux), badge pseudo. |
| `lib/cookies.ts` (26 l.) | Lecture/écriture du pseudo dans le cookie `wlis_pseudo` (1 an, `SameSite=Lax`). |

### Backend (API routes + store)

| Route | Méthodes | Rôle |
|---|---|---|
| `app/api/rooms/route.ts` | `GET` | Liste les rooms actives (vue publique). |
| `app/api/rooms/[id]/route.ts` | `GET` | Métadonnées d'une room (404 si absente). |
| `app/api/rooms/[id]/peers/route.ts` | `GET`/`POST`/`DELETE` | Présence : lister / s'annoncer (crée la room à la volée) / se retirer. |
| `lib/store.ts` (112 l.) | — | Store en mémoire (`globalThis`). Room créée au premier `announce`, supprimée quand le dernier pair part. Nettoyage des pairs inactifs > 30 s. Durée bornée 60 s – 8 h. |

### Détails de la mécanique mesh (`app/room/[id]/page.tsx`)

- **Anti-double-appel** : pour éviter que A et B s'appellent mutuellement, seul le pair dont l'ID est « plus petit » initie l'appel (`if (myId < p.peerId)`).
- **Tolérance aux cold starts serverless** : un appel WebRTC sain n'est coupé qu'après **60 s** d'absence (`PEER_DROP_MS`), pour ne pas tuer une connexion à cause d'un seul poll manqué.
- **STUN configuré** : Google + Twilio. ⚠️ **Aucun TURN** (voir §5).
- **Nettoyage rigoureux au démontage** : fermeture des appels, `peer.destroy()`, arrêt des pistes média, `DELETE` de présence (avec `keepalive`).

---

## 4. État d'avancement — ce qui est FAIT ✅

- **Onboarding pseudo** via cookie persistant, avec écran de saisie et bouton « changer ».
- **Accueil** : liste des rooms publiques rafraîchie automatiquement + bouton refresh manuel, formulaire de création (nom + durée en minutes, bornée 1–480).
- **Création & jointure** de room avec ID court partageable, métadonnées passées par URL (jointure directe par lien possible sans toucher au serveur).
- **Visio mesh WebRTC** fonctionnelle : chaque participant voit et entend les autres en P2P direct.
- **Minuteur synchronisé** pour tous les participants (basé sur l'horloge de départ, pas d'état à répliquer).
- **Contrôles** : couper/réactiver micro et caméra (via `track.enabled`).
- **Lien d'invitation** copié dans le presse-papier.
- **Gestion d'erreurs UI** : permission caméra/micro refusée, room introuvable / lien incomplet, avec écrans dédiés et boutons de récupération.
- **Robustesse présence** : heartbeat + poll, nettoyage des pairs fantômes côté client (60 s) et serveur (30 s).
- **Bug corrigé** (commit `75a46c6`) : on ne kicke plus les utilisateurs avec « Room introuvable ».
- **Prêt à déployer sur Vercel** sans configuration. Le code **typecheck sans erreur**.

---

## 5. Reste à faire 🚧

### 🔴 Bloquants / fragilités pour une vraie mise en production

1. **Store en mémoire incohérent en serverless** — `lib/store.ts` garde les rooms dans une `Map` sur `globalThis`. Sur Vercel, chaque instance serverless a **sa propre copie** : deux utilisateurs sur des instances différentes ne voient pas la même liste de rooms, et la présence peut « clignoter ».
   → Remplacer par **Upstash Redis** ou **Vercel KV** (room = hash métadonnées + sorted set `peerId → lastSeen`, nettoyage paresseux à la lecture). *C'est le point n°1 à régler.*

2. **Pas de serveurs TURN** — seuls des STUN sont configurés (`app/room/[id]/page.tsx`). Les utilisateurs derrière un **NAT symétrique** (4G/5G, réseaux d'entreprise) **n'arriveront pas à se connecter**.
   → Ajouter un TURN (ex. Open Relay gratuit, ou Twilio/metered payant) dans `iceServers`.

3. **Broker PeerJS public** — la signalisation dépend du cloud gratuit de PeerJS, **rate-limité** et sans garantie de disponibilité.
   → Pour un usage sérieux, **self-host `peerjs-server`** et passer `host/port/path` à `new Peer()`.

### 🟠 Limites d'architecture (à anticiper selon l'ambition)

4. **Le mesh plafonne à ~5-6 participants** — le nombre de connexions croît en N². Au-delà, ça sature l'upload et le CPU.
   → Passer à un **SFU** (LiveKit Cloud a un SDK React clé en main et un tier gratuit généreux).

5. **Aucune persistance** — un redémarrage serveur efface toutes les rooms (lié au point 1).

### 🟡 Fonctionnalités manquantes

6. **Minuteur purement visuel** — pas de **son/notification** de fin, pas de **cycles Pomodoro** (focus → pause → focus), pas de **pause/reset/skip**, pas de contrôle par l'hôte. C'est l'argument central du produit : c'est là qu'il y a le plus de valeur à ajouter.
7. **Pas de chat texte** pendant la session.
8. **Pas de partage d'écran**.
9. **Pas de gestion des participants** : pas de rôle hôte, impossible de mute/exclure quelqu'un.
10. **Pas de rooms privées** : toute room devient publique dès qu'un pair s'annonce (ni mot de passe, ni room cachée).
11. **Pseudo non authentifié** : simple cookie, non unique, usurpable.

### 🟢 Qualité, dette technique & sécurité

12. **Sécurité côté API quasi nulle** : aucune validation d'autorisation. N'importe qui peut `POST` des pairs dans n'importe quelle room, polluer la liste publique ou usurper un `username`. Pas de **rate limiting**.
13. **Typage faible autour de PeerJS** (`peer: any`, `call: any`) — fragile aux erreurs.
14. **Aucun test** (unitaire ni e2e) et **pas de CI**.
15. **`reactStrictMode: false`** (`next.config.mjs`) — désactivé probablement pour calmer les double-effets, mais ça masque de vrais bugs de cycle de vie.
16. **Échec broker non géré côté UI** : si PeerJS est down, c'est un simple `console.error`, l'utilisateur reste en « Connexion… » sans feedback.
17. **Présence par polling** (3 s) + heartbeat (5 s) : trafic constant, peu efficace. Acceptable au MVP, à revoir avec un vrai backend temps réel.
18. **Détails produit** : pas de page 404 custom, pas de favicon / métadonnées OG (partage de lien moche), pas de PWA, accessibilité partielle (boutons sans `aria-label`, pas de gestion du focus).
19. **Housekeeping** : modification non commitée sur `tsconfig.json` (triviale, juste un retour à la ligne) — à committer ou jeter.

---

## 6. Roadmap suggérée (ordre de priorité)

1. **Fiabiliser le backend** → migrer `lib/store.ts` vers Vercel KV / Upstash Redis. *(débloque la liste de rooms multi-instances)*
2. **Fiabiliser la connexion** → ajouter des serveurs TURN. *(débloque les réseaux mobiles/entreprise)*
3. **Sécuriser les API** → valider les entrées, rate-limiter, empêcher la pollution des rooms.
4. **Enrichir le minuteur** → son de fin + cycles focus/pause + contrôles hôte. *(plus gros gain produit)*
5. **Self-host le broker PeerJS** si la charge augmente.
6. **Scalabilité** → bascule vers un SFU (LiveKit) si on vise > 6 participants.
7. **Confort** → chat, partage d'écran, rooms privées, tests + CI.

---

## 7. Pour lancer en local

```bash
npm install
npm run dev      # http://localhost:3000
```

La caméra/micro exige un **contexte sécurisé** : ça marche sur `localhost` ; pour tester entre machines, déployer sur Vercel (HTTPS). Dépôt distant : `github.com/GameNotCreator/welockinstudy`.
