<div align="center">

# Laska

### The Great Military Game

*Draughts, reimagined by a world chess champion — where every piece you capture is carried beneath your own, and the board grows into towers.*

&nbsp;

![TypeScript](https://img.shields.io/badge/TypeScript-5.9_strict-3178c6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A522-339933?logo=node.js&logoColor=white)
![Engine](https://img.shields.io/badge/rules_engine-zero_dependencies-success)
![Tests](https://img.shields.io/badge/tests-120%2B_passing-success)
![Build](https://img.shields.io/badge/build_step-none_(raw_TS)-blue)

</div>

---

> *"The game to teach cautiousness and tactics, and a great builder up of ideas."*
> — Dr. Emanuel Lasker, 1911

In 1911, at the height of a twenty-seven-year reign as World Chess Champion, Emanuel Lasker invented a game. It looks, at first, like ordinary checkers: men on the dark squares, moving and jumping along the diagonals. Then the first capture happens — and instead of leaving the board, the captured piece slides *underneath* its captor. The two move together now, a column led by whoever sits on top. Capture by capture, the board climbs into stacks, prisoners change hands, and a quiet game of draughts becomes a war of towers.

Lasca all but vanished for a century. **This is it, rebuilt** — a faithful rules engine, an AI that understands columns rather than counting pieces, and a calm, tactile board you can actually play.

## The one rule that changes everything

In checkers, a captured piece is gone. In Laska, **nothing is erased.**

- **Capture builds.** Jump an enemy and he becomes a prisoner at the base of your column.
- **The top piece commands.** A stack moves, jumps, and belongs to whoever leads it.
- **Freedom flips the board.** Take an enemy column and you capture only its leader — the prisoners below are freed under a new commander.

Eleven men a side. No piece ever leaves. You win by burying or cornering your opponent, not by clearing the board.

## Play it

```bash
cd web
npm install
npm run dev          # → http://localhost:5173
```

That's the whole thing — no account, no keys, nothing to configure. Requires Node 22 or newer.

## What's inside

- **Play anyone.** Hot-seat two-player on one device, or face an AI with six honest difficulty levels — from a beginner that blunders to an expert that looks eight moves deep.
- **Learn in minutes.** A complete, illustrated rulebook drawn from Lasker's original 1911 booklet, with a numbered board, his strategy notes, and the terminology (privates, columns, officers, bombs).
- **Replay history.** Step move-by-move through real recorded games — including **two of Lasker's own teaching games from 1911**, replayed on the live engine.
- **Make it yours.** Five hand-built color palettes (Stone, Dark, Light, Chocolate, Classic) and four piece styles, where generals wear a debossed star, medal, or crown.
- **Play online.** A server-authoritative backend with accounts, Elo matchmaking, real-time matches with clocks, and reconnection — every move validated on the server.
- **A design with a point of view.** A neumorphic, soft-clay aesthetic — sculpted from light and shadow, never flat, never loud.

## The man who made it

Emanuel Lasker — born on Christmas Eve, 1868, the son of a Jewish cantor — held the world chess title longer than anyone before or since: twenty-seven years. He was also a doctor of mathematics (the Lasker–Noether theorem still sits under modern algebra), a published philosopher, and a friend of Albert Einstein. Forced from Nazi Germany in 1933 for being Jewish, he lived out an exile through Moscow and finally New York, where he died in 1941. Among bridge, Go, and chess, Laska was the one game he invented himself.

There's a fuller telling of his life inside the app.

---

# Engineering

> The half of this README for the reader who wants to know how it's built. Laska is
> a ~12,000-line, strict-TypeScript monorepo built around a single principle: **the
> rules of the game are written exactly once.**

## The core invariant: one engine, no drift

`src/` is a pure rules engine — `legalMoves`, `applyMove`, `gameStatus`, board geometry, and the AI — with **zero runtime dependencies**. It is the single source of truth for how Laska is played.

The web client and the online server do **not** re-implement, port, or copy that logic. They `import` it directly as TypeScript:

```
                    ┌─────────────────────────────┐
                    │  src/  — the rules engine    │
                    │  pure · zero-deps · strict   │
                    │  legalMoves · applyMove ·    │
                    │  gameStatus · ai (negamax)   │
                    └──────────────┬──────────────┘
                       imports     │     imports
              ┌────────────────────┴────────────────────┐
              ▼                                          ▼
   ┌────────────────────┐                  ┌──────────────────────────┐
   │  web/  React + Vite │                  │  server/  WebSocket + ws │
   │  board · themes ·   │   shared types   │  authoritative matches · │
   │  replay · online UI │◀ ─ ─ ─ ─ ─ ─ ─ ─ │  matchmaking · Elo · DB  │
   └────────────────────┘   protocol.ts     └──────────────────────────┘
```

The payoff: the rules **cannot** drift between where you play and where they're enforced. A client never gets to disagree with the server about whether a capture is legal, because they are running the identical function. Only the message types cross the boundary (`server/src/net/protocol.ts`), and the client imports those too — so a protocol change is a compile error, not a runtime surprise.

To prove the engine is faithful rather than merely plausible, it **replays Lasker's own 1911 games move-for-move** — they are validated through the live engine at import time, so an engine change that breaks a historical game fails the build.

## The AI

A column is not a pile of material — every captured piece is a permanent, recapturable life — so a piece-counting evaluator plays Laska badly. The engine searches with that in mind:

- **Negamax with alpha-beta pruning** over the forced-capture-heavy move tree, with a **quiescence search** that extends through capture sequences so the evaluator is never called mid-exchange (no horizon-effect blunders).
- A **column-aware evaluation** scoring control, officer rank, buried prisoners, promotion threats, mobility, and two positional refinements drawn from documented Laska strategy ([`STRATEGY.md`](STRATEGY.md)): edge-safety for tall columns and an anti-over-concentration term that discourages fragile over-stuffed towers. Every term is **antisymmetric**, a property the negamax sign-flip depends on and which is enforced by a mirror-position test.
- **Six difficulty tiers** (beginner → expert) that scale search depth and a tunable blunder rate, so a beginner feels beatable without the code faking it.

The evaluator's correctness is pinned two ways: a **frozen, hand-written reference negamax** lives in the test suite so the optimised production search can never silently diverge from textbook results, and an **agent arena** (`src/agents/`) pits the search against random, greedy, and Monte-Carlo-tree-search opponents in round-robin matches to measure real playing strength rather than asserting it.

## Testing & rigor

| Suite | What it covers |
|---|---|
| **Engine (50+)** | rules, captures, promotion, notation round-trips, and AI search — including a self-play harness that plays full games asserting *only legal moves, no exceptions, and conservation of all 22 pieces* |
| **Server (50+)** | match lifecycle, matchmaking, Elo, auth, and a **storage contract test run against every backend** (in-memory, SQLite, Postgres) plus a cluster-fabric parity test (in-memory and Redis), including a multi-node routing test |
| **Playwright e2e** | the real online flow end-to-end against a running server |

Strict TypeScript throughout (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), CI on GitHub Actions, and a deliberate **no-build-step** stance: the engine and server run raw `.ts` via Node 22's native type-stripping, so there is no compile artifact to drift from the source.

## Architecture highlights worth a look

- **Pluggable persistence behind one interface.** `server/src/storage/` defines a `Repository` contract with memory / SQLite / Postgres implementations chosen by env var — and a single contract test that runs against all three, so they can't silently diverge.
- **Horizontal scale as a swappable layer.** `server/src/cluster/` abstracts presence, the matchmaking queue, and cross-node routing behind an interface with in-memory (single-node) and Redis (multi-node) backends, parity-tested the same way.
- **Server-authoritative by construction.** Clients send *intentions*; the server re-derives every move through the shared engine and is the only writer of game state, clocks, and ratings.
- **Ships as one container.** A `Dockerfile` and Vercel config are included; the static web app and the stateful server deploy independently.

## Layout

```
src/        Rules engine + AI — the heart of it (pure, zero-deps, the source of truth)
test/       Engine + AI tests (incl. self-play invariants & a frozen reference search)
web/        React + Vite app you play
server/     Online backend: WebSocket, matchmaking, Elo, pluggable storage + cluster
e2e/        Playwright end-to-end tests
STRATEGY.md Canonical strategy reference the AI heuristic traces back to
DESIGN.md   The neumorphic design system
CLAUDE.md   Engineering guide: exact commands, project map, conventions, DoD
```

## The rules, honestly

The ruleset is reconciled with Dr. Lasker's original *Rules of Lasca, the Great Military Game* (1911) and confirmed by replaying his own published games through the engine. The full, canonical write-up lives inside the app (and in [`DESIGN.md`](DESIGN.md) / the engine's source comments). One genuinely interpretive point — whether you must take the longest capture — is documented there: Lasker advised "the longest run or best advantage," which we read as guidance, so the choice is yours.

## For developers

Working on the code? Start with [`CLAUDE.md`](CLAUDE.md) — it's the engineering guide: exact commands per package, the project map, conventions, and the verification loop, written to get you productive without spelunking. The engine, web app, and server are three separate npm packages (`npm install` in each); from the repo root, `npm test` runs the full engine suite.

---

<div align="center">

*A century-old game, built for now. Your move.*

</div>
