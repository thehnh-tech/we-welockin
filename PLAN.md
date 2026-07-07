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

## Phase 5 — Produit + redesign complet ✅ FAIT (branche `phase-5-ui`)

**Objectif :** passer de « démo qui marche » à « app qu'on rouvre » — implémenté selon la maquette
« WeLockIn study room UI » (dark #161618 / indigo #6366f1, Manrope + JetBrains Mono via next/font).

- [x] **Redesign Home** — header (logo, badge streak, avatar), greeting daté, hero création
      (nom + sujet + timer), carte « Tu as un code ? », rangée de stats, liste live rooms
      (avatars empilés, badge Deep Focus, timer restant qui tick).
- [x] **Redesign Room** — sidebar crew rétractable/drawer mobile (statut + temps de focus par
      personne), chip code room copiable, ring 168/300px, contrôles Micro/Caméra/Deep Focus/Mode focus.
- [x] **Codes de room** — ids `focus-xxxxx` (crypto), join par code, anciens ids compatibles.
- [x] **Statuts live par pair** — `{muted, away, deep}` broadcast à chaque heartbeat + `joinedAt`
      serveur ; détection away via `visibilitychange`.
- [x] **Deep Focus** — micro forcé coupé (bouton disabled), audio distant silencé localement,
      badge tuile + badge room sur l'accueil.
- [x] **Mode focus** — fullscreen, grande ring, grille compacte 6 col, Esc restaure tout.
- [x] **Détection de parole** — WebAudio RMS local → barres EQ + bordure accent.
- [x] **Stats locales** — focus/jour en localStorage → aujourd'hui / semaine / streak (testé).
- [x] **Roster + indicateurs mic** — via payload announce (pas de DataConnection nécessaire).
- [x] **Revue multi-agents adversariale** (9 agents) → correctifs appliqués : crash `URIError`
      sur `%` dans les noms (double-décodage), GET /peers assaini (plus de peerId/status/joinedAt
      publics), clamp des params URL + bannière sur announce 4xx, sidebar cachée hors tab-order,
      drawer fermable au clavier (Esc + bouton), contrastes AA, codes 5 chars crypto.

**Validation :** ✅ tsc, eslint (0 err), vitest 57/57, build ✅ Vérifié en navigateur (preview) :
gate → home → création → room, Deep Focus on/off avec statut serveur confirmé, room « Maths 50% »
sans crash, GET public réduit à `{username}`.

**Reporté (Phase 5b)** : cycles Pomodoro/pauses, chat texte (DataConnection), objectif par
participant, persistance Postgres (historique/streaks cross-device), sélecteur de devices,
screen share, i18n, token de session anti-spoofing entre membres.

---

## Phase 6 — Charte graphique welock ✅ FAIT (branche `phase-6-charte`)

**Objectif :** appliquer la « Charte graphique welock v1.0 » (cozy productivity — papier chaud,
encre brune, terracotta parcimonieux) sur toute l'app, avec animations charte et réglages.

- [x] **Tokens** — surfaces papier (canvas/surface/card/sunken/track), gamme d'encres, accent
      terracotta (« un seul moment vivant par écran »), danger brique, 7 teintes de catégories,
      filets alpha encre, ombres chaudes XS→Modale, rayons 8/11/14/16/20/999, courbe (.2,.8,.3,1).
- [x] **Typo** — Figtree unique (400–700), chronos compris (tabular-nums), interlettrage serré sur
      titres, casse de phrase, eyebrows 11px ; Manrope + JetBrains Mono retirées.
- [x] **Marque** — symbole cadenas animé (anse ouverte au repos, se referme à la connexion — seule
      animation du symbole) + logotype « welock.in » ; voix charte (« Hey {pseudo}, lock in »,
      nombres arrondis « 1h 42m ») ; zéro emoji/glyphe Unicode (SVG filaires façon Lucide).
- [x] **Composants & mouvement** — boutons pilules, « remplissage encre = sélectionné » (contrôles
      engagés, ligne self du roster, flèche join), survol levée + ombre LG, appui scale(.98),
      apparitions fondu + montée 7px (échelonnées), toast glissé-fondu, avatars jetons teintés.
- [x] **Réglages (engrenage)** — pseudo éditable, teinte perso (7 teintes charte, broadcast via
      `status.tint` whiteliste serveur), son de fin, notifications, animations réduites —
      persistés en localStorage (`lib/prefs.ts`), classe `wl-reduce` en plus de la préférence OS.

**Validation :** ✅ tsc, eslint (0 err), vitest 59/59, build ✅ Navigateur : couleurs charte calculées
sur les 2 pages, Figtree actif, réglages persistés + teinte visible dans le roster, cadenas refermé
à la connexion, 0 erreur console. Revue multi-agents → correctifs (voir commit).

---

## Phase 6b — Theming v2 : zones encre + customisation réelle ✅ FAIT (branche `phase-7-theming`)

**Retour utilisateur :** pas assez smooth, options sans effet visible, thème clair mal reçu,
layout trop plat/générique. Réponse :

- [x] **Architecture de theming en variables CSS** — toutes les couleurs passent par `--wl-*`,
      pilotées par `data-wl-theme` / `data-wl-accent` sur `<html>` (anti-flash au premier paint).
- [x] **Thème Papier / Encre** — mode sombre chaud complet (jamais de gris froid).
- [x] **6 accents** (terracotta, vert, bleu, violet, sarcelle, ambre) — CTA, ring, dots suivent en live.
- [x] **Customisation du timer** — style Anneau / Minimal (barre de progression), secondes on/off
      (minutes arrondies sinon, dernière minute en secondes).
- [x] **Zones contrastées** — bandeau encre en haut de la Home (header + héro 46px + stats en gros
      chiffres) ; room : barre supérieure + sidebar encre continues (zone en L).
- [x] **Fluidité** — switch de thème via View Transitions API (crossfade 300ms) ; fix du bug Chromium
      « transitions globales + variables héritées » qui figeait les couleurs (cause racine du
      « les options ne fonctionnent pas ») ; `suppressHydrationWarning` pattern next-themes.

**Validation :** ✅ tsc, eslint, vitest 58/58, build ✅ Navigateur : bascule Papier↔Encre et accents
en live mesurée au DOM, timer Minimal/« 25 min » vérifiés, room en zones encre, hydratation propre.

---

## Phase 6c — Feedback pass 2 ✅ FAIT (branche `polish-vibes`)

- [x] **Rooms publiques / privées** — pilules au créateur ; privée = jamais listée dans Live rooms,
      joignable uniquement par code/lien (`visibility` bout en bout, immuable après création, testé).
- [x] **Carte Join restructurée** — compacte, texte utile (« Private rooms can only be joined this way »).
- [x] **Durées sans unité collée** — « 42 min », « 1h 42 » (`formatShortDuration`, testé).
- [x] **Thème Papier adouci** — canvas #e9e2d4, surfaces crème (fini le quasi-blanc agressif).
- [x] **Temps retirés de la sidebar** (déjà retirés des tuiles au pass précédent).
- [x] **1 session par appareil** — sonde BroadcastChannel avant d'ouvrir la caméra ; écran
      « One session per device » ; testé dans les deux sens (bloqué / débloqué).
- [x] **Tuiles du mode focus agrandies** — auto-fit 160–220px centré (fini les vignettes minuscules).
- [x] **Rétractation sidebar fluide** — glissement `margin-left` du bloc entier (contenu jamais
      re-layouté) + `visibility` différée en fin d'animation.

---

## Phase 6d — Tout privé + compteur d'actifs ✅ FAIT (branche `all-private`)

- [x] **Suppression du système de rooms publiques** — plus de section Live rooms ni de choix
      public/privé : toute room créée est **privée** (code/lien uniquement).
- [x] **Compteur d'utilisateurs actifs** — `GET /api/rooms` ne renvoie plus que
      `{ activeUsers }` = **plancher marketing 130** + total réel des pairs (tous rooms confondus,
      `countActivePeers` dans les 2 backends, testé). Affiché dans le bandeau avec le dot vert.
- [x] La plomberie `visibility` reste en place côté store (deep links, anti-flip) — seule l'UI de
      choix a disparu.

---

## Phase 7 — Scale au-delà du mesh (à la demande)

**Déclencheur :** besoin récurrent de > 5–6 participants par room.

- [ ] Court terme avant migration : **cap dur** de participants dans `announce`, baisser la
      résolution capturée (320×240 / 480×360, `frameRate ~24`), `maxBitrate` via `sender.setParameters()`.
- [ ] Migration **SFU** (LiveKit Cloud — free tier généreux, SDK React drop-in) en remplacement
      du mesh PeerJS. Bénéfice : upload O(1) par client + simulcast.

---

## Dépendances clés
- Phase 2 **avant** Phase 5 (persistance/roster s'appuient sur un état partagé fiable).
- Phase 4 **avant** Phase 5 (refactor hooks = base saine pour les nouvelles features).
- Phase 7 (SFU) indépendante, seulement si le besoin de scale apparaît.

## Sprint 1 suggéré (≈ 1 semaine)
Phase 0 + Phase 1 + Phase 2 → l'app devient **réellement fonctionnelle en prod**, plus rapide,
typée, accessible, et sans les deux bugs visibles. C'est le meilleur rapport valeur/effort.
