# Laska (Lasca) — Rules Engine + AI + Web Vertical Slice

A standalone, fully tested TypeScript implementation of the rules of **Laska**
(also spelled *Lasca*), the column-capturing draughts variant invented by
Emanuel Lasker in 1911, plus an offline AI opponent and a playable local web
app built on top of it.

The `src/` engine is the single source of truth for game logic: pure functions,
no UI, no networking, no platform dependencies — so the identical code runs on a
client (for responsive/optimistic play), inside the AI search, and on a future
authoritative server. Online multiplayer, accounts, ranking, and monetization
are intentionally **not** included yet. See "Scope & what's next" below.

## Milestones in this repo

1. **Rules engine** (`src/`) — pure `legalMoves` / `applyMove` / `gameStatus`
   plus a FEN-like position notation. **Done & tested.**
2. **AI opponent** (`src/ai.ts`) — negamax + alpha-beta over the column-aware
   move generator, a Laska-specific heuristic, and difficulty tiers.
   **Done & tested.**
3. **Local web vertical slice** (`web/`) — React + Vite app: hot-seat 2-player
   and vs-AI, legal-move highlighting, forced-capture teaching, and legible
   column-stack visualization. **Done & verified in-browser.**
4. **Server-authoritative backend** (`server/`) — accounts (scrypt + signed
   tokens, guest + linking), Elo ranking, rating-based matchmaking, real-time
   matches over WebSocket with a per-move clock, draw/resign, reconnection
   resync, and match-history/leaderboard REST. **Done & tested.**
5. **Online play in the web app** (`web/src/net/`, `useOnline.ts`, `Online.tsx`)
   — login/guest, queue, live match with clocks, and **optimistic moves
   reconciled against the authoritative server**. **Done & verified in-browser**
   against a live server + bot opponent.
6. **Durable storage** (`server/src/storage/`) — one `Repository` interface with
   in-memory, **SQLite** (default, durable file via Node's built-in `node:sqlite`,
   no native build), and **Postgres** (`pg`) implementations. Select with
   `LASKA_DB`. A shared contract test proves parity; persistence verified across
   a real server restart. **Done & tested.**
7. **Multi-node cluster** (`server/src/cluster/`) — a `Cluster` fabric for
   presence, a shared matchmaking queue, match ownership, and cross-node message
   routing, with in-memory and **Redis** implementations (`LASKA_CLUSTER`).
   Players on different nodes get matched and play; moves are forwarded to the
   owning node and broadcast back. **Done & tested** (two-node + reconnect tests).

See [TODO.md](TODO.md) for the full roadmap (online client wiring, durable
storage, retention, monetization, mobile, and the legal-gated real-money track).

## Status

- **92/92 automated tests pass** (`node --test`) — 20 engine + 11 AI + 61 server
  (incl. a two-client WebSocket integration test, a storage contract test run
  against in-memory + SQLite, and a **two-node cross-node play** integration test).
  A further **real-Redis** two-node integration test runs with `npm run test:redis`
  (skipped by default unless `REDIS_URL` is set); verified passing locally.
- Engine and AI type-check clean under a strict `tsconfig` (`strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); the server adds
  `noUnusedLocals/Parameters` and `verbatimModuleSyntax`.
- The web app builds clean (`tsc -b && vite build`) and was QA'd in a real
  browser: opening moves, forced captures, AI replies, and column stacking all
  render and play correctly.
- Requires **Node ≥ 22**. The engine/AI/web run via native type-stripping; the
  server uses `--experimental-transform-types` (for TS parameter properties).

```bash
# Engine + AI (from this directory)
npm install
npm test          # node --test on test/**/*.test.ts
npm run typecheck # tsc --noEmit

# Web vertical slice
cd web && npm install && npm run dev    # http://localhost:5173

# Server (accounts, matchmaking, real-time play, ranking)
cd server && npm install && npm test    # 61 tests
npm start                               # http://localhost:8080  (ws://.../ws)

# Storage: defaults to a durable SQLite file (server/laska.db). Override with:
#   LASKA_DB=memory                  ephemeral (no persistence)
#   LASKA_DB=sqlite LASKA_DB_PATH=…  durable file (default kind)
#   LASKA_DB=postgres DATABASE_URL=… production (durable, multi-node)
# Cluster (horizontal scale): single-node in-memory by default. For multi-node:
#   LASKA_CLUSTER=redis REDIS_URL=…  shared queue/presence/routing across nodes
```

> Note on the type-check: `tsc` is used only as a type *checker* (`--noEmit`).
> The engine runs under Node's built-in type-stripping, not via a compile step.

## Rules implemented

These were cross-checked against authoritative sources before coding:

- Wikipedia "Lasca": https://en.wikipedia.org/wiki/Lasca
- MindSports detailed ruleset (Christian Freeling): https://mindsports.nl/index.php/the-pit/609-lasca
- Community summaries of Lasker's original rules (e.g. lidraughts forum)

Lasker's own original-rules page (pjb.com.au/laska) was unreachable at build
time (returned 404), so the rules below rest on the sources above. If you have a
copy of the original rulebook, it's worth a final confirmation pass.

Core rules:

- **Board.** 7×7 grid; play occurs only on the 25 squares where `(row + col)`
  is even. Indexed 0–24 row-major (layout documented in `src/board.ts`).
- **Setup.** 11 soldiers per side on the three nearest rows; the centre row
  starts empty; White moves first.
- **Columns.** A stack is controlled by its **top** piece, the *commander*.
  Soldier-topped columns move/capture **forward only**; officer-topped columns
  move/capture **both directions**.
- **Capture.** Jump an adjacent enemy-controlled square to the empty square
  beyond. Only the **top** piece of the jumped column is taken; it is placed at
  the **bottom** of the capturing column (the commander stays on top). The rest
  of the jumped column stays put and may flip to a different controller.
- **Mandatory capture.** If any capture exists, only captures are legal; a
  capture must continue with the same piece until it can capture no more.
- **Win.** A player wins if the opponent has no controlled pieces, has no legal
  move, or resigns.

### Edge cases (resolved against sources)

These are the cases the brief specifically flagged. Each was checked rather than
assumed:

1. **Promotion ends the move immediately — even mid-chain.** If a soldier-topped
   column reaches the back rank during a capture, it is crowned and the move
   stops, even if further jumps would otherwise be available. This follows the
   MindSports ruleset, which states promotion "ends the move." Officers do not
   re-promote and continue chaining normally.
2. **No maximum-capture rule.** When several capture sequences are available, the
   player chooses freely; there is no obligation to pick the longest. This
   follows Laska's English-draughts heritage (contrast: international draughts
   forces the majority capture). *If you later find a source that says otherwise
   for a specific competition ruleset, this is a one-line change in move
   generation — flagging it as the most "interpretation-dependent" rule here.*
3. **Only the commander promotes.** Pieces beneath a promoted commander are
   unaffected.

### Draw rule — a DESIGN CHOICE, not an official rule

Standard Laska is decisive and does **not** clearly define draws. Per the brief,
the app must design and document one. This engine implements:

- **Threefold repetition** — same position (board + side to move) occurring a
  third time is a draw.
- **No-progress counter** — a configurable number of plies without "progress"
  is a draw. *Progress* = any capture, any soldier-topped move (soldiers only go
  forward, so such moves are irreversible), or a promotion. Default: **40 plies**
  (`DEFAULT_NO_PROGRESS_PLY_LIMIT`), overridable via `gameStatus(state, opts)`.
- **Mutual agreement** — represented in the `GameOutcome` type
  (`reason: 'agreement'`) for the application layer to invoke; the engine does
  not decide agreement on its own.

The 40-ply default is a starting value, not a derived constant — tune it with
playtesting. Loss conditions are checked **before** draw conditions.

## Position notation

A compact, FEN-like string encodes a *position* (board + side to move):

```
<toMove>:<sq>=<stack>,<sq>=<stack>,...
```

- `toMove` is `W` or `B`.
- `sq` is a square index 0–24.
- `stack` lists pieces **bottom → top**, each a 2-char code: colour (`W`/`B`)
  then rank (`s` soldier / `o` officer). Example `WsBo` = White soldier at the
  bottom, Black officer on top (the Black officer controls the column).
- An empty board for White is `W:`.

`encodePosition` always lists squares in ascending index order, so the string is
canonical and doubles as the **repetition key**. `decodePosition` is strict and
throws on malformed input (bad side-to-move, out-of-range square, odd-length or
invalid piece codes).

This notation encodes a position for transmission and repetition detection.
A full move-list/PDN-style game transcript for replays is a deliberate
follow-up, not part of this milestone.

## Public API

From `src/index.ts`:

- `createInitialState(): GameState`
- `legalMoves(state): Move[]` — returns captures only when any capture exists,
  otherwise quiet moves.
- `applyMove(state, move): GameState` — returns a **new** state; the input is not
  mutated. The move is re-simulated from `from` + `path`, so an inconsistent
  `Move` throws rather than corrupting the board.
- `gameStatus(state, opts?): GameOutcome` — `ongoing` / `win` / `draw`.
- `encodePosition`, `decodePosition`
- Helpers: `controlledSquares`, `commander`, `opponent`,
  `isPromotionSquare`, `step`, and the board constants.

State is immutable by convention: `applyMove` clones, and `legalMoves` /
`gameStatus` are read-only.

### AI (`src/ai.ts`)

- `chooseMove(state, opts?): Move | null` — picks a move. `opts.difficulty` is
  `'beginner' | 'easy' | 'medium' | 'hard'` (mapped to search depth 1/2/4/6 with
  a decreasing blunder rate so lower tiers are beatable). `opts.depth`,
  `opts.weights`, and a seedable `opts.random` allow precise control and
  reproducible tests. Returns `null` only when there are no legal moves.
- `scoreMoves(state, depth, weights?): ScoredMove[]` — exact score per legal
  move, sorted best-first (for hints/analysis UIs).
- `evaluate(state, me, weights?): number` — static heuristic. "Material" here is
  column **control**, not raw piece count (Laska never removes pieces), plus
  officer bonus, held-prisoner value, promotion advancement, and mobility.

The search is negamax with alpha-beta, captures ordered first. Because captures
are mandatory and chains are forced, the effective branching factor is low and
depth 6 plays a strong game quickly.

## Web vertical slice (`web/`)

A React + Vite app that imports the engine and AI directly (one shared rules
implementation). It supports hot-seat 2-player and vs-AI play, highlights the
movable pieces and legal destinations, enforces and teaches the mandatory-capture
rule, and renders each **column as a labeled side-on stack** with a height badge
and a screen-reader description of the full bottom-to-top composition — the
hardest Laska UX problem. Color is never the only differentiator (W/B letters +
an officer ring). Run with `cd web && npm install && npm run dev`.

## Tests

`test/rules.test.ts` covers: initial setup, soldier/officer movement, mandatory
capture, basic/chained/free-choice captures, column-ownership flips, quiet and
mid-chain promotion timing, win by no-pieces and by no-moves, threefold-repetition
and no-progress draws (including the counter reset), notation round-tripping and
malformed-input rejection, `applyMove` immutability, and a self-play integration
test that asserts the **total piece count stays constant at 22** — the key
invariant, since Laska never removes a piece from the board (captures only
relocate the top piece to the bottom of another column).

## Caveats / honest limitations

- Rules rest on the secondary sources listed above; Lasker's original page was
  not reachable at build time. Edge case #2 (free choice vs. maximum capture) is
  the most ruleset-dependent and worth confirming against whatever competition
  rules you intend to honor.
- The draw rule is an app design decision, not official Laska.
- `npm test` and `npm run typecheck` were both run and pass in this environment;
  re-run them in yours to confirm, since Node's TS handling is version-sensitive.
- Included so far: engine, AI, and a local web UI. **Not** yet included: online
  multiplayer, a server, accounts, persistence, ranking, or monetization.
- The AI heuristic weights are reasonable defaults, not match-tuned; the engine
  plays soundly (legal, conserves pieces, exploits forced captures) but has not
  been strength-benchmarked against a reference Laska bot.

## Scope & what's next

The brief lays out a build order: rules engine → local 2-player → AI →
multiplayer → accounts → ranking → retention → monetization. This milestone is
the first step. The remaining milestones depend on product decisions that
haven't been made yet (target platforms, single-player vs. online priority,
timeline/budget, whether real-money play is intended, branding). Those choices
materially change the architecture, so they should be settled before building
further.
