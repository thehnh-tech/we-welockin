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

## Phase 2 — Store partagé Redis/KV (~1–2 j) — **CRITIQUE** ✅ FAIT (branche `phase-0-quick-wins`)

**Objectif :** que la découverte de rooms et la présence fonctionnent à travers plusieurs
instances serverless (aujourd'hui `globalThis` casse tout dès la 2ᵉ Lambda).

- [x] **Adapter à 2 backends** — `lib/store/` : interface async unique (`types.ts`),
      `memory.ts` (fallback process-local) et `redis.ts` (Upstash), sélectionnés au démarrage selon
      la présence des credentials (`lib/env.ts`). `.env.example` fourni. Pas de zod (2 strings →
      validation manuelle, zéro dépendance en plus).
- [x] **Schéma Redis** — `wlis:room:{id}` (hash méta, TTL), `wlis:room:{id}:peers` (sorted set
      `peerId→lastSeen`, TTL), `wlis:room:{id}:names` (hash), `wlis:rooms` (index découverte).
      Nettoyage lazy des pairs périmés (>30 s) à chaque lecture ; rooms abandonnées expirent par TTL.
- [x] **#11 corrigé** — plus de destruction de room au départ du dernier pair : in-memory garde une
      fenêtre de grâce (`ROOM_GRACE_MS`), Redis s'appuie sur le TTL. *Vérifié : un lien direct marche
      encore après le départ de tous les pairs.*
- [x] **DoS / caps** — cap global rooms (`MAX_ROOMS`), cap peers/room (`MAX_PEERS_PER_ROOM`),
      body JSON borné (413 au-delà de 4 Ko), `peerId`/`roomId`/noms tronqués + caractères de contrôle
      retirés, rate-limit par IP sur POST/DELETE (actif uniquement avec Redis, généreux).
- [x] **Routes async + dédup** — les 4 handlers passent en `await` ; le shaping `room` dupliqué
      (`roomPublicView` vs inline) est supprimé (`announce` renvoie déjà la méta publique).
- [ ] **À faire (reporté)** : renvoyer `serverNow` pour corriger le **skew d'horloge** du timer
      (petit, low) — pas inclus ici pour garder le diff focalisé sur le store.

**Validation :** ✅ `tsc`, `eslint`, `next build`. ✅ Smoke test complet du backend in-memory
(découverte sans poll, getRoom, grâce #11, caps 413/400, sanitization, clamps, RL no-op).
⚠️ **Le backend Redis est typé + revu mais PAS testé sur une instance réelle** — à valider avec un
Upstash de test (2 process locaux pointant le même Redis → découverte croisée OK) avant prod.

---

## Phase 3 — Fiabilité signaling & media (~1 j) ✅ FAIT (branche `phase-0-quick-wins`)

**Objectif :** arrêter les échecs de connexion silencieux et le SPOF du broker public.

- [x] **#12 TURN configurable** — `lib/rtc-config.ts` (`buildIceServers`) ajoute un TURN aux STUN
      quand `NEXT_PUBLIC_TURN_URL/USERNAME/CREDENTIAL` sont définis (liste séparée par virgules
      supportée). *Vérifié : la var est bien injectée dans le bundle client au build.*
- [x] **Erreur ICE/peer visible** — `peer.on("error")` mappe les types fatals PeerJS vers un message
      FR (`peerErrorMessage`) affiché dans un bandeau dismissible. Plus de `console.error` muet seul.
- [x] **Bandeau « connexion difficile »** — si d'autres participants sont présents mais aucune
      connexion média n'aboutit après 15 s (symptôme NAT symétrique), un bandeau suggère un TURN.
      Se masque dès qu'une connexion s'établit.
- [x] **Self-host `peerjs-server` configurable** — `buildPeerOptions` lit
      `NEXT_PUBLIC_PEER_HOST/PORT/PATH/SECURE` ; sans ça, broker public par défaut. `.env.example` à jour.

**Validation :** ✅ `tsc`, `eslint` (0 err), `next build`, pages home/room rendues sans crash SSR,
injection env TURN confirmée dans le bundle. ⚠️ Le **comportement TURN réel** (connexion derrière NAT
strict) nécessite un test sur réseau mobile/Wi-Fi d'entreprise avec de vraies creds — non automatisable ici.

---

## Phase 4 — Refactor + filet qualité (~2–3 j) ✅ FAIT (branche `phase-0-quick-wins`)

**Objectif :** casser le méga-`useEffect` de ~225 lignes et installer les garde-fous automatiques
avant d'ajouter des fonctionnalités.

- [x] **Hooks extraits** — `app/room/[id]/hooks/` : `useRoomMeta` (résolution méta), `useLocalMedia`
      (getUserMedia + toggles, `catch(e)` typé `DOMException` avec messages FR par cas), `usePeerMesh`
      (PeerJS + calls + présence). La page room passe de ~240 à ~140 lignes, surtout du JSX.
      `roomRef` mis à jour dans un effet (corrige le warning `react-hooks/refs`).
- [x] **Constantes centralisées** — `lib/constants.ts` (`HEARTBEAT_MS`, `PEER_DROP_MS`,
      `STALL_HINT_MS`, `ROOMS_POLL_MS`) + invariant documenté vs `PEER_TIMEOUT_MS` (store).
- [x] **Helpers partagés** — `lib/roomLink.ts` (`buildRoomUrl`/`parseRoomParams`, contrat `?n&d&s`
      unifié) + `lib/time.ts` (`formatClock`). Câblés dans home + Timer ; shaping `room` dupliqué déjà
      supprimé en Phase 2.
- [x] **Tests Vitest** — 27 tests / 5 fichiers : sanitize (clamps, strip ctrl, caps), `formatClock`,
      roomLink (round-trip + rejets), backend in-memory (découverte, grâce #11, anti-hijack méta,
      sanitization), cookies (jsdom).
- [x] **CI GitHub Actions** — `.github/workflows/ci.yml` : `npm ci` → lint → typecheck → test → build.
- [x] **`reactStrictMode: true`** réactivé (cleanups idempotents/garde `cancelled`).
- [ ] **Reporté** : smoke E2E Playwright (2 onglets) ; monitoring Sentry + helper `logError` (les
      `catch{}` best-effort restent silencieux). 4 warnings `react-hooks/set-state-in-effect` laissés
      en `warn` (lecture cookie/URL au montage, reset — patterns légitimes, règles très strictes de Next 16).

**Validation :** ✅ `tsc`, `eslint` (0 err, 4 warn), `vitest` (27/27), `next build`, pages home/room
rendues + API OK après refactor. ⚠️ Le strict mode (double-invoke dev) et le mesh restent à confirmer
en navigateur (2 onglets + caméra).

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
