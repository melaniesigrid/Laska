# Laska — Build Roadmap & TODO

Status as of this checkpoint. The brief's build order is:
**rules engine → local 2-player → AI → online multiplayer → accounts → ranking →
retention → monetization → polish/analytics.**

## ✅ Done and tested

- **Rules engine + AI** (`src/`) — pure `legalMoves` / `applyMove` / `gameStatus`,
  FEN-like notation, negamax + alpha-beta, Laska heuristic, and difficulty tiers.
  55 tests, including arena and historic-replay coverage.
- **Local web vertical slice** (`web/`) — React + Vite, hot-seat + vs-AI, legible
  column stacks. Builds clean; QA'd in a browser.
- **Server-authoritative backend** (`server/`) — accounts (scrypt + signed
  tokens, guest + linking), in-memory repository behind a `Repository`
  interface, **Elo** ranking, **matchmaking** by rating, real-time **matches**
  over WebSocket with per-move clock, draw offers, resignation, reconnection
  resync, and match-history/leaderboard REST. 68 tests incl. a 2-client
  end-to-end integration test.

> Total: **123 automated tests** across engine, AI, and server, all passing on
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
- ✅ A signed-in player can switch to **Local → Computer** without signing out;
  the online session remains available when they switch back.
- ✅ The board rotates 180° for the Black player, so each online player sees
  their own home side nearest them.
- ✅ Reconnect/resync state now pauses move input and explains that the
  authoritative board will restore automatically.
- ✅ Rare capture chains sharing a landing square now open an explicit route
  chooser; the selected full capture path is sent to the server.
- Remaining polish: distinguish **opponent disconnected** from local connection
  loss once the server protocol exposes opponent-presence state.
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
- ✅ **Theme rework (2026-06-22):** the old "Dark" (black border + chocolate board)
  was renamed **Chocolate** with the border unified to the board (one realistic
  chocolate material), and a brand-new **Dark** added — Stone inverted (warm-charcoal
  neumorphism). Five palettes now: Stone, Dark, Light, Chocolate, Classic. See DESIGN.md.

- ✅ **New theme mode — "Navy":** sixth palette with one navy neumorphic
  board/background material, gold general insignia, and blue + red pieces;
  wired into the persisted theme cycle and documented in `DESIGN.md`.
- ⏳ Remaining for production hardening:
  - ✅ **Redis test in CI** — the dedicated CI job starts Redis 7, sets
    `REDIS_URL`, and runs `npm run test:redis` on every push/PR.
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
- ✅ Auth endpoints are rate-limited and covered by `server/test/rateLimit.test.ts`.
  Account lockout / captcha on demonstrated abuse remains open.
- **SECURITY-001 (XFF rate-limit bypass) — fix in PR #6, not yet landed/deployed.**
  Was: `clientIp()` trusted the spoofable leftmost `X-Forwarded-For`, defeating the
  auth throttle (credential stuffing / account spam). Fix derives the IP from a
  trusted proxy hop via `LASKA_TRUSTED_PROXY_HOPS`. Two follow-ups:
  - [ ] **Land the fix.** PR #6 (`fix/auth-ratelimit-xff`) is based on
    `overnight/auth-rate-limit`, which is itself not on `main` and has no PR.
    Open `overnight/auth-rate-limit → main`, then merge #6 (or fold them). The fix
    reaches prod only once both land.
  - [ ] **Set `LASKA_TRUSTED_PROXY_HOPS=1` in the Railway service env** after deploy.
    Railway's edge proxy appends the real client IP (one trusted hop). Without it the
    default `0` keys on the proxy socket → all proxied traffic shares one bucket
    (over-throttles). Required for the fix to actually bite in prod.

### 4. Ranking depth
- Optional upgrade Elo → **Glicko-2** (rating deviation + volatility for
  inactivity handling). Repo needs RD/volatility columns; `rating/elo.ts` is
  isolated so this is a contained change.
- **Seasons** with periodic soft resets and rewards; **divisions/leagues**;
  friends leaderboard.

### 5. Retention systems
- **Profile page** ✅ (`ProfilePage.tsx`) — identity hub with the player's chosen
  mascot, RankBadge + stats, recent games, and the cosmetics pickers. Has
  pre-built optional slots for the streak card + achievements trophy shelf.
- **Cosmetics: account-backed** ✅ — mascot tint / piece theme / board palette
  persist via `PATCH /me/cosmetics` (`selectedMascotTint`/`selectedPieceTheme`/
  `selectedBoardTheme` on `PublicUser`), localStorage fallback for guests.
- Daily **streaks** ✅ — pure `streak.ts` (freeze mechanic, 14 unit tests) +
  `useStreak` hook + topbar `StreakIndicator`, ticked once per finished local
  match, surfaced on the Profile streak card. Next: server-sync the streak so it
  follows the account (today it's per-device localStorage).
- Daily **puzzles/challenges** derived from real positions
  (generate from finished-match positions; the engine can verify solutions).
- **Achievements / trophy shelf** — derive badges from saved-game data; render in
  the profile's achievements slot.
- **Quests/missions**, well-timed (non-spammy) push notifications.
- Social: friend challenges, **shareable replays** (we already persist full move
  lists), spectating, clubs/teams.
- **Interactive tutorial** — see the dedicated flagship section below. This is a
  primary selling point, not just onboarding.

### 6. Monetization (verify all fees/SDKs against current docs before relying)
- **Freemium subscription**: analysis, unlimited puzzles, deeper stats, ad
  removal. Web billing via **Stripe**.
- **Lessons & courses** (see flagship tutorial section): the interactive tutorial
  ships free as the hook; **paid course packs** (Openings, tactics, endgames,
  column strategy) are a content monetization line on top of it.
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

### ⭐ FLAGSHIP: Interactive Tutorial & Lessons

A **complete, interactive tutorial** is a primary selling point — most players
have never seen Laska, so a great "learn it in 5 minutes" experience is the
single biggest lever on activation and retention. Source material is collected
in `TUTORIAL.md` (rules, the four capture beats, copy). Build order:

- **Phase 1 — the core mechanic (free, the hook).** A guided, on-board interactive
  walkthrough of the four beats: (1) you jump an enemy, (2) it tucks beneath you,
  (3) the top piece (commander) rules, (4) capturing frees the prisoners below.
  Each beat is a real position the player must execute on the actual board, with
  highlights, a "do this move" prompt, validation via the engine (`legalMoves`),
  and a gentle "try again" on a wrong move. No login. Ends in a first win vs a
  Beginner bot. Reuse the real `BoardView` + engine; drive steps from a script.
- **Phase 2 — reading the board.** Officers (2-dot generals), tall columns +
  count, forced capture, promotion on the far row, draw rules. Short, interactive.
- **Phase 3 — practice puzzles.** "White to move and capture" / "free your
  prisoners" positions; the engine verifies solutions. Feeds daily puzzles too.
- **Phase 4 — Lessons & courses (monetizable).** Structured mini-courses, each a
  sequence of interactive lessons + puzzles:
  - **Openings** — sound first moves on 7×7, why the centre row matters.
  - **Tactics** — chains, multi-jumps, sham sacrifices that win a column.
  - **Column strategy** — when to build tall vs stay mobile; freeing prisoners.
  - **Endgames** — converting a material/column edge; avoiding the draw counter.
  - Free intro lesson per course; full course behind the subscription / one-time
    purchase (see Monetization → Lessons & courses).
  - ✅ First strategy lesson set shipped: four engine-validated, interactive
    lessons (column safety, guarding, one-handed attack, attack over defence)
    with guided moves and local progress. Course packaging/paywall remains open.
- **Tech notes.** Tutorial steps as data (`{position, prompt, expectedMove(s),
  hint, successText}`), rendered over `BoardView`. A `TutorialBoard` wrapper adds
  step highlighting + move gating. Progress saved to `localStorage` (later: account).
  Keep it engine-driven so lessons can't drift from the real rules.

### 6b. Historic games (heritage content) — ⏳ PARTIAL
- ✅ **Replay viewer** (`web/src/ReplayPage.tsx` + `games.ts`): steps a recorded
  game move-by-move on the real `BoardView`, positions produced by the engine
  replaying the lasca.org score (parse each ply → `applyMove`). Linked from the
  landing + Lasker page. Shipped: **Moscow 1996** (Tatarinow–Roschtschin),
  validates end-to-end.
- ✅ **Canonical rules brochure** (`web/src/BrochurePage.tsx`): the full ruleset
  from Lasker's 1911 booklet + numbered board diagram + strategy notes + games +
  proposition. Source of truth, reconciled with `src/rules.ts`.
- ✅ **Engine validated against PRIMARY SOURCE:** Lasker's own 1911 booklet
  **Game 2 (39 plies) and Game 3 (78 plies) replay move-for-move** through our
  engine. The capture-rule question is **resolved**: free-choice is correct —
  Lasker wrote "longest run *or best advantage*", which is guidance, not strict
  maximum-capture. Both games are live in the replay viewer.
- ⏳ **Scores that still don't fully replay** (held back, shown as text only):
  lasca.org Game 1 (1976) and Game 2 (a different 1911 game), and brochure
  Games 1/4/5 (Game 4 reaches 74/75 plies; 1 & 5 stop earlier). All consistent
  with faded-scan digit ambiguity the transcription flagged — re-transcribe and
  re-run `games.ts` (throws on the first illegal ply) to recover them.

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
- ⏳ DONE (seam): typed client-side analytics seam at `web/src/analytics/` —
  `track(event, props)` over a pluggable sink (default = no-op/console; NO vendor
  SDK or API key wired in). Event taxonomy + funnel stages in
  `analytics/events.ts`; streaks/puzzles/billing engineers import event names
  from there. Existing touchpoints wired: app open (`app.loaded`/`app.returned`),
  local + online match start/first-move/finish, signup/login/guest.
- TODO (gated, NOT YET): swap the default sink for a real product-analytics
  vendor — **verify the vendor + its current SDK/pricing against live docs**, and
  **only after a GDPR/CCPA consent gate** is in place (`setSink` must be called
  from a consent-gated init path; the default stays a no-op so nothing leaves the
  device pre-consent).
- TODO: decide if/when to add a server `/events` ingest endpoint. Client-only is
  the right call for now — a vendor sink covers reporting, and an own-endpoint
  needs a storage schema, retention policy, and the same consent gate first
  (touches the storage repository contract, another engineer's lane). The
  pluggable sink lets us point at `/events` later without changing call sites.

### 10. Quality & compliance
- **Accessibility audit**: the slice avoids color-only cues and labels columns
  for screen readers — extend to full keyboard play, focus management, scalable
  text, and a formal contrast/AT pass.
- **Privacy/legal**: privacy policy + consent; **GDPR/CCPA**; **COPPA /
  age-gating** if minors may play.
- **Branding/IP**: the *game* Laska is public domain, but verify any chosen brand
  name/logo isn't trademarked and confirm app-store naming rules.

### 11. AI build-process documentation (⏳ ONGOING — keep current)
Documenting that Laska is built *by AI agents* is a first-class part of the
project — it shows the milestones and the process, not just the result.
- ✅ **`BUILD_LOG.md`** — the source-of-truth milestone log (build order, per
  milestone: agent / shipped / verified / honest edge). Links out to `AI.md`
  (opponent internals), `AI_RESEARCH.md` (arena), and the architect prompt; does
  not duplicate them.
- ✅ **In-app build story** — `web/src/BuildStoryPage.tsx` (+ `buildStory.css`),
  routed as the `build` view in `App.tsx`, linked from `Landing.tsx`
  ("How this was built"). Curated, visitor-facing view of the log.
- ✅ **In-app opponent explainer** — `web/src/AIPage.tsx` ("How the computer
  plays"), with a live, measured Search Lab.
- ⏳ **Keep it current (recurring):** every time an agent completes a milestone,
  append a new `### Mn` block to `BUILD_LOG.md` and, if visitor-facing, mirror it
  in `BuildStoryPage.tsx`. Quote only reproducible numbers (`npm test`, a
  benchmark, a replay). Never rewrite a past milestone — append only.
- ⏳ **Next candidates to document** when shipped: the flagship tutorial, an
  external AI-strength benchmark, and production hardening (migrations/failover).

### 12. Charter-scoped web engineers — greenfield scaffolding (overnight lane: PR-only)

Three new domains now have dedicated owners in `.claude/agents/`. Each task below
is **bounded, owner-tagged, and in the web PR-only lane** — the overnight dispatcher
may route it to the named subagent but must open a PR for review, never auto-merge
(web has no automated browser tests). Verify loop for all three: from `web/` →
`npx tsc --noEmit`, then run the app for any visible surface. Each owns only its
listed files and consumes the engine read-only via `src/index.ts`.

- **[puzzle-generator-engineer]** Scaffold the puzzle pipeline in `web/src/puzzles/`
  (`generate.ts` miner, `verify.ts` engine oracle, `types.ts`, `dailyPuzzle.ts`,
  `dataset.ts`) + `PUZZLES.md`. Mine forcing/tactical moments from finished games
  (`web/src/games.ts` + saved games); **every shipped puzzle's solution must be proven
  legal-and-winning through `src/index.ts`** before it enters `dataset.ts` — never a
  hand-asserted best move. Deliver a small seeded, verified set + a deterministic
  puzzle-of-the-day selector. Feeds — does not own — the growth daily-puzzle loop
  (retention §5) and tutorial Phase 3.
- **[opening-book-curator-engineer]** Populate `web/src/openings.ts` + new
  `web/src/openingsData.ts` with 2–3 named openings (e.g. Hague opening, Berlin
  defence, Wing gambit) as **engine-validated line data** — each ply replays through
  `src/index.ts` at import, the way `games.ts` does — plus a read-only
  `web/src/OpeningsPage.tsx` study view in the neumorphic style (see `DESIGN.md`) and
  `OPENINGS.md`. Wiring the page into the router/`App.tsx` is **Frontend's** lane —
  hand it off, don't edit `App.tsx`. Distinct from the tutorial's paid Openings course
  (Phase 4), which consumes this repertoire as data.
- **[i18n-localization-engineer]** Scaffold `web/src/i18n/` (`index.ts`, `provider.tsx`,
  `useTranslation.ts`, `keys.ts`, `locales/` with an English baseline + one stub locale)
  + `I18N.md`. Provide a `LocaleProvider` + `t()` hook that **reads** the route locale
  prefix the SEO re-arch left ready. Do **not** touch `web/src/seo/`, `web/index.html`,
  `vercel.json`, the routes, or `App.tsx` — the provider wrap is handed to Frontend.

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
- **Ambiguous capture chains** that share a landing square now have an online
  route chooser that sends the full `captures` path. Local play still auto-picks
  the longest chain; add the same chooser there if authored positions expose it.
- **AI strength is not benchmarked** against a reference Laska engine; heuristic
  weights are reasonable defaults, not tuned.
- **Rules edge case to confirm**: free-choice vs. maximum-capture. We implemented
  free choice (English-draughts heritage) per sources; confirm against whatever
  competition ruleset you intend to honor. Lasker's original-rules page was
  unreachable at engine build time.
