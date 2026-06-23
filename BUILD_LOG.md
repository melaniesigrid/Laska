# Building Laska with AI — Milestone Log

> How this app was built: a running, honest record of the milestones reached and
> the process behind them. Laska was built with a team of **specialised AI agents**
> driving the code, each one a read-only consumer of the engineering guide
> ([`CLAUDE.md`](CLAUDE.md)) and gated by the same verification loop a human team
> would use — typecheck, tests, replay Lasker's own 1911 games.
>
> This is the *process* document. For the opponent AI's internals, this log points
> out to the deep technical write-ups — it does not duplicate them:
> [`AI.md`](AI.md) (engineering notes on the negamax opponent),
> [`AI_RESEARCH.md`](AI_RESEARCH.md) (the pluggable-agent research/arena layer),
> and [`laska-ai-architect-prompt.md`](laska-ai-architect-prompt.md) (the reusable
> meta-prompt that briefed the opponent's design).
>
> **Accuracy rule for this file:** every number here is either measured from the
> repo or it isn't quoted. Test counts are reproducible (`npm test` in each
> package). Where something is *not yet done* it says so — the same standard the
> rest of the project holds itself to.

---

## How to read this log

The brief fixed a build **order**, and the milestones below follow it:

> rules engine → local 2-player → AI → online multiplayer → accounts → ranking →
> retention → monetization → polish/analytics.

Each milestone records four things:

- **Agent** — which specialised role drove it (the roster is in the repo's agent
  config; the relevant ones are named per milestone).
- **Shipped** — what concretely exists in the tree now.
- **Verified** — how we know it works (tests, replays, in-browser QA).
- **Honest edge** — what is deliberately *not* done, so the log never oversells.

This is a **living document**. New milestones are appended in order; nothing is
rewritten after the fact, so the trail of decisions stays auditable.

---

## The verification spine (what every milestone is measured against)

Before the milestones, the one invariant that makes the rest trustworthy:

- **One engine, imported everywhere.** `src/` is the single rules engine. `web/`
  and `server/` import it directly as TypeScript — they never fork game logic. A
  rule can never drift between where you play and where it's enforced.
- **Replayed against the primary source.** The engine is validated by replaying
  **Emanuel Lasker's own 1911 published games** move-for-move (`web/src/games.ts`
  throws on the first illegal ply). If an agent breaks a rule, a century-old game
  stops replaying — an instant, unambiguous failure signal.
- **Tests, measured today:** **47** engine/AI/agents tests (`./test/`) + **53**
  server tests (`server/test/`) = **100** automated tests, all passing on
  Node ≥ 22. Reproduce: `npm test` at the repo root, and `npm test` in `server/`.
  *(An earlier checkpoint quoted 65 — that predated the agent-arena and the
  Redis/multi-node suites. This file tracks the current measured count.)*

---

## Milestones

### M1 · The rules engine — the sacred core
**Agent:** engine-engineer · **Order:** 1 (foundation)

- **Shipped:** `src/rules.ts` (`createInitialState` / `legalMoves` / `applyMove` /
  `gameStatus`), `src/board.ts` (geometry), `src/notation.ts` (FEN-like position
  string, later reused as the repetition key), `src/types.ts`. Pure functions,
  zero dependencies.
- **Verified:** 20 tests in `test/rules.test.ts`; reconciled with Lasker's 1911
  *Rules of Lasca*.
- **Honest edge:** one genuinely interpretive rule — must you take the *longest*
  capture? — was resolved later, at M9, by the heritage replay (Lasker wrote
  "longest run *or best advantage*", i.e. guidance, not a hard maximum-capture
  law). Free choice is correct.

### M2 · The AI opponent — search, not a neural net
**Agent:** game-ai-engineer · **Order:** 3

- **Shipped:** `src/ai.ts` — **negamax + alpha-beta** over the column-aware move
  generator, a **Laska-specific evaluation** (material is *column control*, not
  piece count, because captures bury instead of removing), six difficulty tiers
  (depth + blunder rate), and an optional **quiescence** extension that fixes the
  horizon effect on the top tiers.
- **Verified:** 17 tests in `test/ai.test.ts`, including a **PARITY** test —
  optimisations off must reproduce a frozen reference negamax bit-for-bit — and a
  proof the evaluation is exactly antisymmetric (`evaluate(s, W) === −evaluate(s, B)`),
  which is what the negamax sign-flip requires.
- **Deeper write-up:** [`AI.md`](AI.md). The design brief that scoped it (and the
  explicit "no cargo-culting AlphaGo" reasoning) is [`laska-ai-architect-prompt.md`](laska-ai-architect-prompt.md).
- **Honest edge:** weights are reasonable, **not yet match-tuned**; no
  transposition table (deliberate — Laska's draw rules are path-dependent and a
  naïve position cache could mis-score a repetition). See `AI.md` §6.

### M3 · Local vertical slice — a board you can actually play
**Agent:** frontend-board-engineer · **Order:** 2 + first play of 3

- **Shipped:** `web/` — React + Vite, hot-seat two-player and vs-AI on one device,
  legible column stacks, the `view`-state router in `App.tsx` (no router library).
- **Verified:** typecheck clean (`npx tsc --noEmit`) + in-browser QA. (Web has no
  unit tests by design; it's verified by typecheck + running the app.)
- **Honest edge:** ambiguous capture chains that share a landing square auto-pick
  the longest chain locally — fine offline, revisited for online disambiguation.

### M4 · Server-authoritative online play
**Agent:** backend-realtime-engineer · **Order:** 4

- **Shipped:** `server/` — real-time matches over WebSocket with per-move clocks,
  draw offers, resignation, and reconnection resync. Every move is **re-validated
  on the server** against the same `src/` engine — the client is never trusted.
- **Verified:** part of the 53 server tests, including a **two-client end-to-end
  integration test** (`server/test/integration.test.ts`).
- **Honest edge:** in-progress match state lives in the owning node's memory (see
  M7 for the multi-node story and the failover gap).

### M5 · Accounts & ranking
**Agent:** backend-realtime-engineer · **Order:** 5–6

- **Shipped:** accounts (scrypt + signed access/refresh tokens, guest play with
  later linking), **Elo** rating (`server/src/rating/elo.ts`), and **matchmaking
  by rating**.
- **Verified:** `server/test/auth.test.ts`, `elo.test.ts`, `matchmaking.test.ts`.
- **Honest edge:** email verification and password-reset *delivery* are not wired
  (the token hooks exist; no provider sends mail). Dev token secrets are random
  per boot — real deployments must set `LASKA_ACCESS_SECRET` / `LASKA_REFRESH_SECRET`.

### M6 · Durable storage behind one interface
**Agent:** infra-platform-engineer · **Order:** production-hardening of 4–6

- **Shipped:** a `Repository` interface with three backends — `InMemory`
  (tests/ephemeral), **SQLite** (default, `node:sqlite`, no native compile), and
  **Postgres** (`pg`, multi-node). Selected by `LASKA_DB`.
- **Verified:** a shared **contract test** (`server/test/repository.test.ts`) runs
  the *same* suite against every backend to guarantee parity, plus a durability
  test that writes, reopens the file, and re-reads.
- **Honest edge:** Postgres still needs versioned migrations (today's `init()` is
  create-if-not-exists), a seed script, and pool tuning before production.

### M7 · Multi-node cluster fabric
**Agent:** infra-platform-engineer · **Order:** horizontal-scale of 4

- **Shipped:** a `Cluster` interface abstracting presence, a shared matchmaking
  queue, match ownership, and cross-node routing. `InMemoryBroker` (single-node +
  deterministic tests) and **`RedisCluster`** (Redis HASH queue with lock-guarded
  atomic pairing, presence/ownership keys, per-node pub/sub). A move on node A is
  routed to the node that owns the match, validated there, and broadcast back.
- **Verified:** a two-node integration test (cross-node match + move + resign +
  Elo), a cross-node reconnect test, and a **live test against a real Redis**
  (`server/test/redis.integration.test.ts`, `npm run test:redis`) — which
  surfaced and fixed a real shutdown-ordering bug.
- **Honest edge:** no in-progress match **failover** yet — if the owning node
  dies, that match's live state is lost. The Redis test isn't in CI yet.

### M8 · The "How the AI thinks" explainer — documenting the opponent *in the app*
**Agent:** game-ai-engineer + frontend-board-engineer

- **Shipped:** `web/src/AIPage.tsx` — a visitor-facing, layered explainer of the
  negamax opponent (intuition → search → evaluation → optimisations → honest
  limits), including a **Search Lab** that runs the *real* engine in the browser
  and reports **measured** node counts. Every number on the page is either
  imported from the engine or measured live, so it cannot drift from the code.
- **Verified:** typecheck + in-browser; the lab's figures are produced by the same
  `SearchStats` instrumentation `AI.md` documents.
- **Why it's a milestone:** this is the first piece of *the AI explaining itself to
  the player*. This build log and the build-story page (M10) extend that idea from
  "how the opponent thinks" to "how the whole app was built."

### M9 · Heritage content & the rules verdict
**Agent:** heritage-archivist-engineer · **Order:** retention/heritage of 7

- **Shipped:** `web/src/ReplayPage.tsx` + `games.ts` — a move-by-move replay viewer
  on the real board; the canonical rules brochure (`BrochurePage.tsx`). **Lasker's
  own 1911 Game 2 (39 plies) and Game 3 (78 plies) replay move-for-move**, plus
  Moscow 1996.
- **Verified:** the replay *is* the verification — `games.ts` validates every game
  through the engine at import time.
- **Honest edge:** some faded-scan scores (lasca.org Game 1; brochure Games 1/4/5)
  don't yet fully replay and are shown as text only, pending re-transcription.

### M10 · This milestone log + the in-app build story
**Agent:** (whoever is reading this) — the meta-milestone

- **Shipped:** this file (`BUILD_LOG.md`, the source of truth) and a curated,
  visitor-facing build-story page in the web app surfacing these milestones.
- **Verified:** the page typechecks and is reachable from the landing page; this
  log is kept in sync with the repo's measured state.
- **Honest edge:** this is the milestone that is explicitly **never finished** —
  it's appended to as the build continues (see "Maintaining this log").

### M11 · Engine-driven strategy lessons
**Agent:** tutorial-content-engineer + frontend-board-engineer · **Order:** retention

- **Shipped:** four interactive lessons for column safety, guarding, the
  one-handed attack, and attacking over defending. The scripts are data, every
  expected move is resolved through `legalMoves` at load time, `TutorialBoard`
  gates input on the real `BoardView`, and completion persists locally. The Navy
  palette also closes the six-theme cosmetics item.
- **Verified:** the web production build passes; the lesson picker, guided move,
  completion persistence, and Navy theme cycle were exercised in a browser.
- **Honest edge:** this is the first strategy lesson set, not the flagship
  first-run “learn Laska in five minutes” capture tutorial. Course packaging,
  account-backed progress, and paid content remain open.

---

## What's next (the honest frontier)

These are the next milestones, not yet started or only partial. They live in full
detail — with effort/impact and guardrails — in [`TODO.md`](TODO.md):

- **Flagship first-run tutorial** (tutorial-content-engineer) — the strategy
  lesson set now ships; the five-minute capture-mechanic walkthrough remains the
  biggest activation lever, since most players have never seen Laska.
- **AI strength benchmarking** (game-ai-engineer) — the opponent's relative
  strength is measured in the arena (`AI_RESEARCH.md` §6); an external,
  reference-engine benchmark is still open.
- **Retention & monetization** (growth-monetization-engineer) — streaks, puzzles,
  subscription/cosmetics. **Hard guardrail:** real-money tournaments are gated on
  legal review and must not be built until then (see `TODO.md`).
- **Production hardening** (infra-platform-engineer) — Postgres migrations and
  match failover. Redis integration coverage now runs in CI.

---

## Maintaining this log

When an agent completes a milestone:

1. Append a new `### Mn · …` block in build order — never rewrite a past one.
2. Fill all four fields: **Agent**, **Shipped**, **Verified**, **Honest edge**.
   A milestone with no "Honest edge" is suspect; almost everything has one.
3. Quote only numbers you can reproduce from the repo (`npm test`, a benchmark, a
   replay). If you can't measure it, don't print it.
4. Point to deep docs (`AI.md`, `AI_RESEARCH.md`, `TODO.md`); don't duplicate them.
5. If the in-app build-story page surfaces the milestone, keep the two in sync.

---

© Melanie Baratto — https://github.com/melaniesigrid
</content>
</invoke>
