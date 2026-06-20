# Laska — Build Roadmap & TODO

Status as of this checkpoint. The brief's build order is:
**rules engine → local 2-player → AI → online multiplayer → accounts → ranking →
retention → monetization → polish/analytics.**

## ✅ Done and tested

- **Rules engine** (`src/`) — pure `legalMoves` / `applyMove` / `gameStatus`,
  FEN-like notation. 20 tests. Verified against authoritative sources.
- **AI opponent** (`src/ai.ts`) — negamax + alpha-beta, Laska heuristic,
  difficulty tiers. 11 tests.
- **Local web vertical slice** (`web/`) — React + Vite, hot-seat + vs-AI, legible
  column stacks. Builds clean; QA'd in a browser.
- **Server-authoritative backend** (`server/`) — accounts (scrypt + signed
  tokens, guest + linking), in-memory repository behind a `Repository`
  interface, **Elo** ranking, **matchmaking** by rating, real-time **matches**
  over WebSocket with per-move clock, draw offers, resignation, reconnection
  resync, and match-history/leaderboard REST. 34 tests incl. a 2-client
  end-to-end integration test.

> Total: **65 automated tests** across engine, AI, and server, all passing on
> Node ≥ 22. Engine/AI run with native type-stripping; the server adds
> `--experimental-transform-types` (for TS parameter properties / enums).

---

## 🔜 Next up (highest leverage first)

### 1. ✅ Wire the web client to the server (online play) — DONE
Implemented and verified in-browser against a live server + bot opponent:
- `web/src/net/client.ts` — REST + reconnecting WS client that reuses the
  server's protocol types (`import type ... from server/src/net/protocol.ts`),
  auto-refreshes the access token, and re-syncs an in-progress match on reconnect.
- `web/src/useOnline.ts` — React hook: login/guest, queue, **optimistic move**
  (apply locally via the shared engine, then snap to the authoritative
  `match.update`; roll back on a server `error`), live clocks, draw/resign.
- `web/src/Online.tsx` — auth panel, lobby/queue, live match with both clocks,
  end screen with rating delta. Top-level Local/Online tabs in `App.tsx`.
- Remaining polish: flip the board for the Black player; a richer reconnect/
  "opponent disconnected" banner; an online-disambiguation UI for the rare
  capture chains that share a landing square (client currently sends the longest).
- Test helper: `server/scripts/bot.ts` (a guest AI opponent) for manual E2E.

### 2. Durable storage (replace in-memory repo) — ✅ MOSTLY DONE
- ✅ `Repository` now has three implementations behind one interface:
  `InMemoryRepository` (tests/ephemeral), **`SqliteRepository`** (default;
  durable file via Node's built-in `node:sqlite`, no native compile), and
  **`PostgresRepository`** (`pg`, for multi-node production). Selected by
  `LASKA_DB=sqlite|memory|postgres` (`config.ts` + `storage/factory.ts`).
- ✅ A shared **repository contract test** runs the same suite against memory +
  SQLite to guarantee parity, plus a durability test that writes, reopens the
  file, and re-reads. Verified live: a user registered before a process restart
  logs in after it.
- ✅ Graceful shutdown closes the DB on SIGINT/SIGTERM.
- ⏳ Still to do for production Postgres:
  - A real **migration tool** (the current `init()` is create-if-not-exists;
    move to versioned migrations, e.g. node-pg-migrate / drizzle).
  - A **seed script**, connection-pool tuning, and backups.
  - Integration-test the Postgres path in CI against a real Postgres (the
    contract test is structured to add it: point a 3rd backend at `DATABASE_URL`).
### 2b. Multi-node / horizontal scale — ✅ CORE DONE
The server is no longer single-node-bound. A `Cluster` fabric
(`server/src/cluster/`) abstracts presence, a shared matchmaking queue, match
ownership, and cross-node message routing:
- ✅ `InMemoryBroker` — single-node default + deterministic multi-node testing.
- ✅ `RedisCluster` — Redis HASH queue with a lock-guarded atomic pairing,
  keys for presence/ownership, and pub/sub (one channel per node) for delivery.
  Selected by `LASKA_CLUSTER=redis` / `REDIS_URL`.
- ✅ `GameServer` routes everything through the fabric: a move by a player on
  node A is forwarded to the node that owns the match, validated there, and the
  authoritative update is broadcast back to both players' nodes. Reconnecting to
  a *different* node resyncs the in-progress match.
- ✅ Verified by a two-node integration test (cross-node match + move + resign +
  Elo) and a cross-node reconnect test, plus broker unit tests.
- ✅ **Live integration test against a real Redis** — `test/redis.integration.test.ts`
  runs two nodes against an actual Redis (shared queue + lock, presence, pub/sub
  routing, cross-node move/resign, Elo, ownership release). Skips unless
  `REDIS_URL` is set; run with `npm run test:redis` (after starting a throwaway
  `redis-server --port 6390`). Surfaced + fixed a real shutdown-ordering bug
  (socket-close cluster ops now tolerate a closing fabric).
- ⏳ Remaining for production hardening:
  - **Wire the Redis test into CI** — stand up a Redis service in the CI job and
    set `REDIS_URL` so `test:redis` runs on every push (it passes locally today).
  - **Owner-affinity optimization**: today the pairing node owns the match even
    if both players are on other nodes; prefer the node hosting a player to cut
    hops. Sticky LB routing by user would remove most forwarding entirely.
  - **In-progress match failover**: a match's authoritative state lives only in
    the owner node's memory; if that node dies the match is lost. Persist live
    match state (Redis/DB) or checkpoint move lists for recovery.
  - **Clock-tick ownership**: each node enforces clocks for matches it owns; fine
    today, but revisit if matches migrate between nodes.

### 3. Accounts hardening
- **Email verification** delivery (provider: Postmark/SES/Resend) — the flag and
  token issuance hook exist; sending does not.
- **Password reset** flow (token + email).
- **Social sign-in** (Google, Apple). On iOS, if you offer third-party social
  login, Apple may require **Sign in with Apple** — verify the current App Store
  Review Guideline before submission.
- Consider a managed provider (Clerk / Auth0 / Supabase / Firebase) instead of
  the custom auth; the server only depends on `verifyToken → TokenPayload`.
- Rate-limit auth endpoints; add account lockout / captcha on abuse.

### 4. Ranking depth
- Optional upgrade Elo → **Glicko-2** (rating deviation + volatility for
  inactivity handling). Repo needs RD/volatility columns; `rating/elo.ts` is
  isolated so this is a contained change.
- **Seasons** with periodic soft resets and rewards; **divisions/leagues**;
  friends leaderboard.

### 5. Retention systems
- Daily **streaks**, daily **puzzles/challenges** derived from real positions
  (generate from finished-match positions; the engine can verify solutions).
- **Quests/missions**, well-timed (non-spammy) push notifications.
- Social: friend challenges, **shareable replays** (we already persist full move
  lists), spectating, clubs/teams.
- **Interactive onboarding** that teaches the column-capture mechanic — the
  game's main hook and unfamiliar to most players. (The slice has a static "How
  to read the board" panel; make it an interactive tutorial.)

### 6. Monetization (verify all fees/SDKs against current docs before relying)
- **Freemium subscription**: analysis, unlimited puzzles, deeper stats, ad
  removal. Web billing via **Stripe**.
- **Cosmetics**: board themes, piece/column skins (non-pay-to-win; never sell
  ranked advantages).
- **Season/battle pass**: free + premium tracks.
- **Ads**: rewarded video + interstitials on the free tier, gated out of ranked
  matches.
- **Mobile billing reality**: digital goods generally must use **StoreKit /
  Google Play Billing**, not Stripe. Apple/Google commission is commonly cited
  around **15–30%** depending on program/tier — **verify current rates and
  small-business-program eligibility**. Consider **RevenueCat** to unify
  entitlements across platforms (verify its current API).

### 7. Mobile (after web online play works)
- React Native / Expo app reusing the engine + AI + protocol types. Extract
  `src/` (engine), `ai.ts`, and `net/protocol.ts` into a shared workspace
  package consumed by `web/`, `mobile/`, and `server/`.

### 8. Anti-cheat & fairness
- Server already validates every move (foundation in place).
- Add engine-assistance detection heuristics (implausibly strong play,
  move-timing anomalies), rate limiting, and report/flag tooling + an admin view.

### 9. Analytics & live-ops
- Instrument funnels (install → first match → signup → D1/D7 → first purchase)
  with a product-analytics tool; add crash reporting. Make monetization/retention
  decisions from data.

### 10. Quality & compliance
- **Accessibility audit**: the slice avoids color-only cues and labels columns
  for screen readers — extend to full keyboard play, focus management, scalable
  text, and a formal contrast/AT pass.
- **Privacy/legal**: privacy policy + consent; **GDPR/CCPA**; **COPPA /
  age-gating** if minors may play.
- **Branding/IP**: the *game* Laska is public domain, but verify any chosen brand
  name/logo isn't trademarked and confirm app-store naming rules.

---

## ⛔️ Real-money tournaments — GATED ON LEGAL REVIEW (do not implement yet)

You indicated real-money tournaments are intended. This is **deliberately not
built** and must not be until the following is done, because it can constitute
**regulated gambling** that varies by jurisdiction:

1. **Get qualified legal counsel** on every target jurisdiction (skill-game vs.
   gambling classification, licensing, prize-pool handling, withholding/tax,
   age/identity (KYC) requirements, AML).
2. Decide the model (entry-fee tournaments vs. sweepstakes vs. free-to-play with
   prizes) **with counsel** — the classification hinges on details.
3. Only then design: KYC/identity verification, geofencing, a payments/escrow
   provider that supports contests/gaming, responsible-gaming controls
   (deposit/loss limits, self-exclusion), audit logging, and dispute handling.
4. App-store policy review (Apple/Google have specific real-money-gaming rules
   and per-region restrictions).

Until 1–4 are satisfied, monetization should stay subscription / cosmetics / ads
/ battle-pass only. The architecture keeps money flows out of the core, so adding
a compliant contest layer later does not require reworking the game/rating code.

---

## Notes / known limitations to revisit

- **In-memory storage is not durable** and not multi-node — first production task
  is the Postgres/Redis swap (item 2).
- **Dev token secrets are random per boot** — set `LASKA_ACCESS_SECRET` /
  `LASKA_REFRESH_SECRET` in any real deployment, behind TLS + a reverse proxy.
- **Ambiguous capture chains** that share a landing square require the client to
  send the `captures` path; the web slice currently auto-picks the longest chain
  locally (fine offline, revisit for online disambiguation UX).
- **AI strength is not benchmarked** against a reference Laska engine; heuristic
  weights are reasonable defaults, not tuned.
- **Rules edge case to confirm**: free-choice vs. maximum-capture. We implemented
  free choice (English-draughts heritage) per sources; confirm against whatever
  competition ruleset you intend to honor. Lasker's original-rules page was
  unreachable at engine build time.
