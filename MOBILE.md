# Laska Mobile — Native App Architecture (iOS + Android)

> Status: **two playable verticals** (v1, scaffold + local + online). Owner-facing
> engineering doc for shipping the Laska web app as a production React Native app
> to the Apple App Store and Google Play.
>
> Implemented & typechecking clean (`npx tsc --noEmit`):
> - **Local play** — hot-seat + vs-AI (all difficulty tiers) on the shared engine
>   (`screens/GameScreen.tsx`, `hooks/useGame.ts`, SVG `components/Board.tsx`).
> - **Online ranked play** — guest **or email/password** auth → matchmaking queue →
>   a fully playable, server-authoritative match on the board: optimistic moves with
>   rollback, both clocks, draw offers, resignation, and an end screen with the
>   rating delta (`screens/OnlineScreen.tsx`, `hooks/useOnline.ts` — a port of
>   `web/src/useOnline.ts`). The board flips 180° for the Black player and
>   highlights the last move. A **reconnect banner** pauses move input and the
>   in-match controls while the socket is down (the board resyncs on reconnect),
>   and the lobby shows a live **top-players leaderboard** (public REST endpoint).
> - **Capture-path disambiguation** — when several capture chains share a landing
>   square, a route chooser (`components/CaptureChooser.tsx`) sends the exact full
>   `captures` path; shared by local and online play (no silent first-pick).
> - **Shared online session** — a single `LaskaClient` lives in `online/OnlineProvider.tsx`
>   at the nav root (`useOnlineSession()`), so the Online and Profile tabs share one
>   socket and one consistent account state (no more per-screen desynced clients).
> - **Profile tab** (`screens/ProfileScreen.tsx`) — account card (rating, rated games,
>   guest/email, connection), **guest → email/password upgrade** (`client.linkGuest`),
>   and a **Stone/Dark theme toggle**.
>
> Known v1 gaps (see body): account deletion needs a server `DELETE /account`
> endpoint (shown disabled until it lands), push registration endpoint, theme
> persistence to AsyncStorage, and font assets.
>
> Accuracy note: the Expo/RN ecosystem moves fast. Every version number, store
> rule, and price in this doc is marked **VERIFY** where it is time-sensitive.
> Confirm against the primary source (Expo SDK release notes, React Navigation
> docs, Apple Developer, Google Play Console) before relying on it. Do not treat
> any version pin here as authoritative — `npx expo install` resolves the
> SDK-correct versions for you.

## v1 scope (decided)

A **focused play slice**, free, no in-app purchases:

- Local hot-seat (2-player on one device)
- Vs-AI (all difficulty tiers — the existing engine + search)
- Online ranked play (WebSocket, server-authoritative, Elo)
- Streaks (retention) — *depends on `web/src/streak.ts` reaching `main`; see Gaps*
- Push notifications **planned** (streak reminders, your-turn, daily) — requires a
  new backend token-registration endpoint

Explicitly **out** of v1: lessons/openings, Lasker bio, brochure, build story,
replays/saved games, cosmetics/IAP. They follow in updates.

**Hard guardrail:** real-money tournaments are legally gated and are NOT built.

## Reuse map — what ports vs. what is rebuilt

The single most valuable fact: **`src/` (the rules engine) is 100% DOM-clean and
platform-agnostic.** It ports verbatim. This is not a "wrap the web app" job — the
entire view layer is rebuilt for native, but the brains are shared.

| Layer | Web source | Mobile plan | Verdict |
|---|---|---|---|
| Rules engine | `src/` (`index.ts`, `rules.ts`, `ai.ts`, `board.ts`, `notation.ts`, `types.ts`) | Imported as-is via Metro `watchFolders` | **SHARE verbatim** |
| AI search | `src/ai.ts` `chooseMove` + `web/src/ai/aiClient.ts` | Reuse `chooseMove`; replace Web Worker with an interaction-friendly async strategy (see AI threading) | **SHARE logic, rebuild host** |
| Net protocol types | `server/src/net/protocol.ts` (`ClientMessage`/`ServerMessage`/DTOs) | Imported as-is | **SHARE verbatim** |
| Net client | `web/src/net/client.ts` (`LaskaClient`) | Port: same protocol/methods, but storage is injected (SecureStore) instead of hard-coded `localStorage` | **SHARE-after-refactor** |
| Online hook | `web/src/useOnline.ts` | Re-port hook logic against the mobile client | **SHARE logic, rebuild** |
| Game/streak logic | `web/src/streak.ts`, `savedGames.ts` (pure TS) | Import the pure modules; localStorage-backed ones get a storage adapter | **SHARE-after-refactor** |
| View layer | `App.tsx`, `Board.tsx`, all `*Page.tsx`, lucide-react, `motion` | **Rebuilt** in RN (`<View>`/`<Pressable>`/`Reanimated`/`react-native-svg`) | **REBUILD** |
| Styling | `styles.css`, `landing.css`, etc. (plain CSS, `clamp()`, neumorphic shadows) | **Rebuilt** as a StyleSheet theme module; neumorphism via layered shadows | **REBUILD** |
| Routing | homegrown `useState<view>` switch in `App.tsx` (no URL routes) | React Navigation (native-stack + bottom-tabs) | **REBUILD** |

### The one real blocker

`LaskaClient` reads/writes `localStorage` directly
([web/src/net/client.ts](web/src/net/client.ts) lines ~66, 107–109). RN has no
`localStorage`. `fetch` and `WebSocket` are both available in RN, so they are
fine. Fix: make storage an injected adapter (default `localStorage` on web, a
SecureStore-backed adapter on native). This is non-breaking on web and lets both
platforms share one client. Until that refactor lands, the mobile scaffold ships a
**mirror** client that reuses the protocol types directly (preserving the
"client and server cannot drift" property) and uses SecureStore.

## Stack decisions (with tradeoffs)

Each: leading choice, one credible alternative, when to switch. **VERIFY current
recommended versions before committing** — do not assume.

1. **Runtime: Expo (managed + config plugins / dev-client).**
   - Why: EAS Build & Submit, `expo-notifications` for push, `expo-secure-store`
     for Keychain/Keystore-backed tokens, OTA-capable. No v1 native module needs
     bare RN.
   - Alternative: bare React Native — switch only if a future native module has no
     Expo support. None in v1 does.
   - Note: if IAP is added later, `react-native-iap` (or `expo-in-app-purchases`'s
     successor — **VERIFY** what is current/maintained) works via a config plugin +
     dev-client, not Expo Go.
   - **VERIFY** the current Expo SDK version; generate the app with
     `npx create-expo-app@latest` so the SDK and its peer versions are correct.

2. **Navigation: React Navigation (native-stack + bottom-tabs).**
   - Why: the web app uses a homegrown state-based view switch, not URL routes, so
     there is no file-based-routing mental model to preserve. React Navigation maps
     cleanly onto the existing `setView` pattern; bottom tabs fit the slice
     (Play / Online / Profile). Deep links are configured via `linking`.
   - Alternative: Expo Router (file-based) — switch if deep/universal links to
     specific matches become central and we want URL parity with the future web SEO
     routes.
   - **VERIFY** against current React Navigation docs for the installed version.

3. **Data / state: ported `LaskaClient` + React hooks; minimal global context.**
   - Why: the web app uses plain hooks + the `LaskaClient` class and a custom
     `useOnline` hook — no Redux/Zustand. Keep that. Server-state lives in the
     client + hook; cross-screen state (auth user, theme) via React context. Sized
     to a small team, not over-engineered.
   - Alternative: TanStack Query for the REST surface (auth/leaderboard) if it
     grows; Zustand if global state sprawls. Not needed at v1.

4. **Styling: React Native `StyleSheet` + a `theme/` tokens module mapped from
   `DESIGN.md`.**
   - Why: the web uses plain CSS (not Tailwind), so NativeWind buys little. The
     neumorphic soft-UI needs custom layered shadows/elevation that read more
     clearly in `StyleSheet` + tokens. `clamp()` → a responsive scale util off
     screen width + safe-area insets.
   - Alternative: NativeWind if the team prefers Tailwind syntax; Tamagui rejected
     as over-engineering for this scope.

5. **Board rendering: `react-native-svg`.**
   - Why: faithful neumorphic coins/stacks (gradients, bevels, rank pips, count
     badges) and crisp scaling. **VERIFY** `react-native-svg` version via
     `npx expo install react-native-svg`.
   - Alternative: pure `<View>` + shadows — simpler but harder to match the coin
     bevel/insignia fidelity.

6. **Animation: `react-native-reanimated` (+ `react-native-gesture-handler`).**
   - Why: native-thread move/capture animations and drag-to-move; the web uses
     `motion`, which has no RN-DOM equivalent. **VERIFY** versions via
     `npx expo install`.

7. **Secure token storage: `expo-secure-store`** (Keychain on iOS, Keystore on
   Android). Auth tokens NEVER go in `AsyncStorage`/plain storage. Non-secret prefs
   (theme, streak cache) may use `AsyncStorage`.

8. **Push: `expo-notifications`** + a new server endpoint `POST /push/register`
   (store Expo push token per user/device). Permission requested **contextually**
   (after first online match or first streak interaction), never on cold launch.
   **VERIFY** Apple/Google push setup steps (APNs key, FCM v1) against current docs.

## AI threading on native

`web/src/ai/aiClient.ts` runs `chooseMove` in a **Web Worker** with a synchronous
fallback. RN has no Web Worker. Options, in order of preference:

1. Keep the existing async API surface (`getBestMove(state, opts): Promise<Move>`)
   but run the search with cooperative yielding / `InteractionManager` so the UI
   thread stays responsive; show a "thinking" state. Adequate for current depths.
2. If deep tiers janky on low-end devices, move the search onto a JS worker thread
   (e.g. `react-native-worklets`/a worker runtime — **VERIFY** what is current and
   maintained) or a Reanimated worklet, mirroring the Web Worker design.

Either way the engine code is unchanged; only the host differs.

## Project structure (monorepo, shared engine)

The mobile app lives at `Laska/mobile/` and imports the shared engine and protocol
from the repo via Metro `watchFolders` — true sharing, not copies.

```
Laska/
  src/                      # shared engine (unchanged) — imported by web AND mobile
  server/src/net/protocol.ts# shared protocol types — imported by both
  web/                      # existing web app (unchanged)
  mobile/                   # NEW — Expo React Native app
    app.config.ts           # Expo config (icons, splash, plugins, bundle ids)
    metro.config.js         # watchFolders → repo root, so ../src resolves
    babel.config.js
    tsconfig.json           # paths: @engine/* -> ../src, @protocol -> ../server/...
    package.json
    src/
      App.tsx               # NavigationContainer + providers
      navigation/           # stack + tabs
      theme/                # tokens mapped from DESIGN.md + neumorphic helpers
      engine/               # thin re-export of ../../src + native AI host
      net/                  # ported LaskaClient (SecureStore) + protocol re-export
      storage/              # SecureStore + AsyncStorage adapters
      screens/              # Play, Game, Online, Profile
      components/           # Board (svg), Coin, Button, StatusPill, ...
      hooks/                # useGame, useOnline (ported), useStreak (ported)
```

## Build → submit pipeline (EAS)

- **EAS Build** for iOS + Android binaries; **EAS Submit** to TestFlight / Play
  internal testing. `eas.json` profiles: `development` (dev-client),
  `preview` (internal), `production`.
- Code signing: iOS via EAS-managed credentials (or App Store Connect API key);
  Android via an EAS-managed or uploaded keystore. **VERIFY** current EAS flow.
- **ACCOUNT-GATED (flagged — no accounts yet):** every step below is blocked until
  the developer accounts exist. The scaffold stops here by design.
  - Apple Developer Program — **VERIFY** current price (commonly cited ~$99/yr).
  - Google Play Developer — **VERIFY** current price (commonly cited ~$25 one-time).
  - Bundle identifiers / package names reserved.
  - APNs auth key (iOS push) + FCM (Android push) configured for `expo-notifications`.

## Store-readiness checklist (plan from day one; confirm against live consoles)

Treat all of these as **current-as-of-unknown** — store policy changes; confirm
against Apple App Store Review Guidelines and Google Play policies at submission.

- [ ] App icons + splash (adaptive icon for Android).
- [ ] Versioning: `version` + iOS `buildNumber` + Android `versionCode` strategy.
- [ ] **Apple privacy "nutrition" labels** — declare data collected (account
      email, gameplay/online, push token, any analytics).
- [ ] **Google Play Data Safety form** — same data, separate form.
- [ ] **Account deletion path** — accounts exist (email/guest), so both stores
      require an in-app account-deletion flow (and Apple, a reachable deletion
      method). **VERIFY** current requirement. Needs a server `DELETE /account`.
- [ ] **App Tracking Transparency (ATT)** — only required IF tracking across apps
      occurs. The analytics seam (`web/src/analytics`) is first-party today; if it
      stays first-party, ATT may not be required — **VERIFY** before shipping any
      SDK that tracks.
- [ ] Permission usage-description strings (push; plus camera/photos only if a
      future feature needs them — v1 needs none beyond notifications).
- [ ] Notifications: request contextually; handle denial gracefully.
- [ ] Crash reporting (e.g. Sentry — **VERIFY** current RN/Expo setup).
- [ ] No secrets in the bundle; tokens in SecureStore only.
- [ ] First-submission risk is usually **paperwork, not code** — privacy labels,
      vague permission strings, missing account-deletion. Prep these early.

## Backend changes required (small, additive)

The Railway server stays as-is for play. v1 adds:

1. `POST /push/register` — `{ token, platform }`, auth'd — store Expo push token.
2. Server-side push triggers — your-turn, streak reminder (later: daily content).
3. `DELETE /account` — account deletion for store compliance.
4. CORS/origin: REST + WS already origin-flexible for `fetch`/`WebSocket`; confirm
   the mobile origin is accepted and rate limits account for mobile reconnects.

## Gaps / things to confirm (do not paper over)

- **Streaks** (`web/src/streak.ts`, `useStreak.ts`) are **uncommitted WIP on
  `growth/daily-streaks`**, not on `main`. The mobile streak UI depends on that
  pure logic landing on `main`; until then it is stubbed behind a flag.
- **Server endpoints** `/push/register` and `/account` deletion do **not exist
  yet** — owned by the backend engineer; mobile wires the client side and degrades
  gracefully until they ship.
- All **VERIFY** markers above: Expo SDK + peer versions, store prices, store
  policy specifics, push setup. Confirm against primary sources at build time.
