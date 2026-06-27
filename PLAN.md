# Plan d'action — WeLockInStudy

> Roadmap issue de l'analyse multi-dimensions (sécurité, correction, archi, UX, qualité, perf),
> dédupliquée et vérifiée dans le code. Ordonné par **dépendances** puis **impact/effort**.
> Coche au fur et à mesure. Estimations en jours-dev approximatifs.

## Vue d'ensemble (ordre recommandé)

| Phase | Thème | Pourquoi maintenant | Effort |
|-------|-------|---------------------|--------|
| 0 | Quick wins | Risque quasi nul, valeur immédiate (requêtes, types, a11y, UX timer) | ~0,5 j |
| 1 | Bugs medium | Défauts visibles en multi-pairs (tuile gelée / fantôme) | ~0,5 j |
| 2 | **Store partagé (Redis/KV)** | **Débloque le produit en prod multi-instances** (critique) | ~1–2 j |
| 3 | Fiabilité signaling & media | Connexions qui échouent en silence (NAT) | ~1 j |
| 4 | Refactor + filet qualité | Rend toutes les phases suivantes sûres et testables | ~2–3 j |
| 5 | Produit (Pomodoro, chat, roster…) | Transforme le démo en produit retenu | ~3–5 j |
| 6 | Scale (SFU) | Seulement quand on dépasse ~6 participants | à la demande |

**Chemin critique :** Phase 2 conditionne le « ça marche vraiment en prod ». Les phases 0/1 peuvent
se faire avant ou en parallèle. La Phase 4 idéalement avant la Phase 5 (sinon on construit sur du sable).

---

## Phase 0 — Quick wins (~0,5 j) ✅ FAIT (branche `phase-0-quick-wins`)

**Objectif :** gains immédiats, à faible risque, sans changement d'architecture.

- [x] **#6 Réparer le lint** — Next 16 n'a plus `next lint` : installé `eslint` + `eslint-config-next@16.2.9`,
      créé `eslint.config.mjs` (flat config), script `"lint": "eslint ."` + `"typecheck": "tsc --noEmit"`.
      Les 4 règles `react-hooks` strictes (latest-value ref, setState au montage) passées en `warn`
      car elles ciblent le refactor Phase 4. Lint vert (0 erreurs).
- [x] **#8 Typer PeerJS** — `import type PeerJS, { MediaConnection } from "peerjs"` (type-only, n'impacte
      pas le bundle car la lib reste en import dynamique). Tous les `any` PeerJS retirés ; callbacks inférés.
- [x] **#5 Supprimer le poll redondant** — `announce()` lit désormais `data.peers` de sa propre réponse
      POST ; fonction `poll()` et son `setInterval(3000)` supprimés. Un seul timer (4 s).
      Vérifié en runtime : un POST renvoie bien la liste complète des pairs (découverte sans poll).
- [x] **#2 Feedback fin de timer** — `components/Timer.tsx` : chime WebAudio (2 notes, sans asset),
      `Notification` (permission demandée au montage), titre clignotant. Respecte `prefers-reduced-motion`
      et ne se déclenche pas en rejoignant une session déjà terminée.
- [x] **#9 Accessibilité timer** — `role="timer"` + `aria-label` dynamique, SVG/chiffres `aria-hidden`,
      annonce unique de fin via `role="status" aria-live="polite"` (sr-only).
- [x] **#10 Garde-fous d'entrée** — `app/page.tsx` : minutes `NaN`/≤0 → 25, cap 8 h.
      `lib/store.ts` : `durationSec` non-fini → défaut, `startedAt` borné à `[now - durationSec, now]`.
      Vérifié en runtime (durée 999999999 → 28800, startedAt futur → now).
- [x] **Feedback "Inviter"** — état transitoire « Lien copié ! » (vert) + fallback `execCommand` pour
      les contextes non sécurisés (LAN HTTP) où `navigator.clipboard` est `undefined`.
- [x] **a11y divers** — `aria-label` sur le refresh `↻` ; `aria-pressed` + `aria-label` sur Micro/Caméra.
- [x] **README** — « older than 15s » → **30 s**. Bonus : `*.tsbuildinfo` ajouté au `.gitignore`.

**Validation :** ✅ `tsc --noEmit` (0), ✅ `eslint .` (0 erreurs, 4 warnings tracés Phase 4),
✅ `next build`, ✅ smoke test API (announce renvoie les pairs, clamps appliqués).

---

## Phase 1 — Bugs medium (~0,5 j) ✅ FAIT (branche `phase-0-quick-wins`)

**Objectif :** corriger les défauts visibles dès qu'il y a 2+ participants.

- [x] **#3 `hasVideo` figé (caméra distante off)** — `components/VideoTile.tsx`.
      Détection corrigée en `enabled && !muted && live` (le `muted` du receveur est le seul signal
      d'une caméra distante coupée ; `enabled` ne couvrait que le cas local). Re-render déclenché par
      un `useEffect` abonné aux events `mute`/`unmute`/`ended` + `addtrack`/`removetrack`.
- [x] **#4 Calls dupliqués / tuile fantôme** — `app/room/[id]/page.tsx`.
      `peer.on("call")` : si un call existe déjà pour ce pair, on ferme l'ancien et on garde le
      nouveau (= attempt le plus frais, gère la reconnexion sans rejeter). Handlers `close`/`error`
      gardés par identité (`activeCalls.get(id) === call`) : un call obsolète ne peut plus évincer
      le call vivant ni retirer une tuile saine.

**Validation :** ✅ `tsc`, `eslint`, `next build`. Scénarios tracés (connexion normale, caméra
distante off, reconnexion avec doublon, erreur sur call obsolète) — état final correct quel que soit
le timing des events. *(Test manuel 2 navigateurs avec caméra recommandé avant merge.)*

---

## Phase 2 — Store partagé Redis/KV (~1–2 j) — **CRITIQUE**

**Objectif :** que la découverte de rooms et la présence fonctionnent à travers plusieurs
instances serverless (aujourd'hui `globalThis` casse tout dès la 2ᵉ Lambda).

- [ ] Provisionner **Upstash Redis** (ou Vercel KV) — gratuit, REST, compatible edge.
- [ ] Introduire `lib/env.ts` (validation **zod**) + `.env.example` (`REDIS_URL`, `REDIS_TOKEN`).
- [ ] Réécrire `lib/store.ts` derrière la **même interface** (`getRoom`, `listActiveRooms`,
      `announce`, `removePeer`, `listPeers`, `roomPublicView`) — un simple swap d'implémentation.
      Schéma proposé :
      - `room:{id}` → hash `{ name, durationSec, startedAt }`, TTL d'inactivité (~2 min)
      - `room:{id}:peers` → **sorted set** `peerId → lastSeen` (score), nettoyage lazy `< now-60s`
      - `rooms:index` → sorted set des rooms actives (score = `startedAt`) pour `listActiveRooms`
- [ ] **#11** En conséquence : ne plus détruire la room au départ du dernier peer — laisser le TTL gérer.
- [ ] **DoS / mémoire (#15)** : ajouter un cap global de rooms + cap peers/room, et un
      **rate-limit par IP** sur `POST/DELETE` (Upstash Ratelimit). Borner la taille du body JSON
      (`peers/route.ts:29`) et la longueur de `peerId`/`roomId`.
- [ ] Renvoyer `serverNow` dans la réponse announce → corrige proprement le **skew d'horloge** du
      timer (le joiner calcule `remaining` à partir de l'horloge serveur, pas la sienne).

**Validation :** `vercel dev` ou 2 process locaux pointant le même Redis → un user voit la room créée
par l'autre ; un redeploy ne perd pas les rooms actives ; flood d'ids uniques ne fait pas croître la mémoire.

---

## Phase 3 — Fiabilité signaling & media (~1 j)

**Objectif :** arrêter les échecs de connexion silencieux et le SPOF du broker public.

- [ ] **#12 Ajouter un serveur TURN** — `app/room/[id]/page.tsx:260`, compléter `iceServers` avec
      un TURN (Open Relay Project, gratuit) en plus des STUN. Indispensable derrière NAT symétrique.
- [ ] **Erreur ICE visible** — sur `peer.on("error")` / échec de connexion (`:289`), afficher un
      message FR (« Connexion impossible — réseau restrictif ? ») au lieu du seul `console.error`.
- [ ] **Self-host `peerjs-server`** (optionnel mais recommandé) — passer `host/port/path` via
      `lib/env.ts`, supprimer la dépendance au broker public rate-limité.
- [ ] **Bannière reconnexion** — après N échecs de heartbeat/poll consécutifs, afficher « Reconnexion… »
      (remplace les `catch{}` muets).

**Validation :** test sur réseau mobile/partage de connexion (NAT strict) → la connexion aboutit ;
couper le réseau affiche la bannière puis se rétablit.

---

## Phase 4 — Refactor + filet qualité (~2–3 j)

**Objectif :** casser le méga-`useEffect` de ~225 lignes et installer les garde-fous automatiques
avant d'ajouter des fonctionnalités.

- [ ] **Extraire des hooks** depuis `app/room/[id]/page.tsx:103` :
      `useLocalMedia()` (getUserMedia + toggles), `usePresence()` (announce/poll), `usePeerMesh()`
      (PeerJS + calls). Stabiliser les dépendances (dépendre de `room?.startedAt` via une ref, pas
      de l'objet `room`) — corrige le bug latent « changer la metadata reconstruit tout le mesh +
      ré-acquiert la caméra ».
- [ ] **Centraliser les constantes** — `lib/constants.ts` partagé client/serveur
      (heartbeat 5 s, `PEER_TIMEOUT_MS` 30 s, `PEER_DROP_MS` 60 s, tick…). Invariant à documenter :
      `PEER_DROP_MS > PEER_TIMEOUT_MS > HEARTBEAT_MS`.
- [ ] **Types & liens partagés** — `lib/types.ts` (types Room/Peer uniques, redéfinis 4× aujourd'hui)
      + `lib/roomLink.ts` (`buildRoomUrl` / `parseRoomParams`) ; exporter `roomMetaView` pour
      supprimer le shaping inline dupliqué (`peers/route.ts:46`).
- [ ] **Tests Vitest** sur les helpers purs : clamps & cleanup de `store.ts`, `Timer.format`,
      `roomUrl`/`parseRoomParams`, `cookies`.
- [ ] **CI GitHub Actions** : `npm ci` → `lint` → `tsc --noEmit` → `build` → `vitest run`.
- [ ] **Smoke E2E Playwright** : 2 onglets, « deux users se voient » (aurait attrapé la régression
      de découverte de la Phase 2).
- [ ] **Réactiver `reactStrictMode: true`** (`next.config.mjs`) une fois les cleanups idempotents.
- [ ] **Monitoring** — brancher Sentry (client + routes API), remplacer les `catch{}` par `logError`.

**Validation :** CI verte sur PR ; couverture des helpers ; strict mode activé sans double-init.

---

## Phase 5 — Produit (~3–5 j, itératif)

**Objectif :** passer de « démo qui marche » à « app qu'on rouvre ».

Par ordre d'impact :

- [ ] **Cycles Pomodoro / pauses** — modèle de phases (work/break/cycles) dans les métadonnées room,
      dérivé de `elapsed`. C'est *le* cœur de la catégorie study-with-me.
- [ ] **Chat texte** — via `DataConnection` PeerJS (coût quasi nul), canal de secours en room muette.
- [ ] **Roster participants + indicateurs mic/cam** — diffuser l'état mute/cam (DataConnection ou
      payload announce) ; badge micro coupé ; détection de niveau audio (speaker actif).
- [ ] **Objectif/tâche par participant** — petit champ « sur quoi tu bosses » affiché sur la tuile.
- [ ] **Persistance des sessions (rétention)** — tier Postgres (Neon/Supabase) `sessions(user, room,
      joined_at, left_at, focus_sec)` écrit au join/leave → historique, stats, streaks. **C'est la
      feature qui fait revenir l'utilisateur.**
- [ ] **Confort** : sélecteur de caméra/micro (`enumerateDevices`), screen share, background blur,
      grille `auto-fit minmax`, état solo « En attente de participants », `prefers-reduced-motion`,
      contrastes WCAG AA, **i18n** (sortir le français codé en dur, `layout.tsx:15`).

---

## Phase 6 — Scale au-delà du mesh (à la demande)

**Déclencheur :** besoin récurrent de > 5–6 participants par room.

- [ ] Court terme avant migration : **cap dur** de participants dans `announce`, baisser la
      résolution capturée (320×240 / 480×360, `frameRate ~24`), `maxBitrate` via `sender.setParameters()`.
- [ ] Migration **SFU** (LiveKit Cloud — free tier généreux, SDK React drop-in) en remplacement
      du mesh PeerJS. Bénéfice : upload O(1) par client + simulcast.

---

## Dépendances clés
- Phase 2 **avant** Phase 5 (persistance/roster s'appuient sur un état partagé fiable).
- Phase 4 **avant** Phase 5 (refactor hooks = base saine pour les nouvelles features).
- Phase 6 indépendante, seulement si le besoin de scale apparaît.

## Sprint 1 suggéré (≈ 1 semaine)
Phase 0 + Phase 1 + Phase 2 → l'app devient **réellement fonctionnelle en prod**, plus rapide,
typée, accessible, et sans les deux bugs visibles. C'est le meilleur rapport valeur/effort.
