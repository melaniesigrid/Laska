# Laska — Agent Guide

What it is: a TypeScript implementation of **Laska** (Lasca), Emanuel Lasker's 1911 column-capturing draughts variant — a pure rules engine + AI (`src/`), a React web app (`web/`), and a server-authoritative online backend (`server/`). **Most important rule: `src/` is the ONE rules engine.** `web/` and `server/` import it directly as TypeScript (`../../src/index.ts`, `../../../src/index.ts`). Never fork or re-implement game logic; change rules only in `src/`, and they must still replay Lasker's games (`web/src/games.ts` validates them at import time).

Three separate npm packages (`./`, `web/`, `server/`), each with its own `node_modules` — **install in each separately**. There is no workspace manager.

## Commands

Requires **Node ≥ 22** (engine/web run raw `.ts` via Node's native type stripping; `server/` adds `--experimental-transform-types`). No lint or formatter is configured — match surrounding style by hand.

Engine + AI (from repo root `./`):
- Install: `npm install`
- All tests: `npm test`  (`node --test "test/**/*.test.ts"`)
- **Single test file: `node --test test/rules.test.ts`**
- Single test by name: `node --test --test-name-pattern="<regex>" test/rules.test.ts`
- Typecheck: `npm run typecheck`  (`tsc --noEmit`)

Web app (from `web/`):
- Install: `npm install`
- Dev: `npm run dev`  → http://localhost:5173 (no env needed)
- Build: `npm run build`  (`tsc -b && vite build`)
- Typecheck only: `npx tsc --noEmit`
- Preview a build: `npm run preview`
- **Tests — two runners, split by filename:**
  - `npm test` → vitest + jsdom + Testing Library, runs `src/**/*.spec.{ts,tsx}` (components/hooks).
  - `npm run test:logic` → Node's built-in runner, runs the `*.test.ts` pure-logic files (`streak.ts`, `cosmetics.ts`) with no DOM.
  - Watch mode: `npm run test:watch`. Config: `web/vitest.config.ts`; setup: `web/src/test/setup.ts`.
  - Write component/hook tests as `*.spec.tsx`; write pure-logic tests as `*.test.ts` (vitest deliberately ignores those — they import `node:test`).
  - **Test files are excluded from the production build** (`tsconfig.json`) so `npm run build` never depends on test-tooling types — that coupling once broke the Vercel deploy. Typecheck the tests with `npm run test:types` (`tsconfig.test.json`). CI runs both.

Server (from `server/`):
- Install: `npm install`
- All tests: `npm test`
- Single test file: `node --experimental-transform-types --test test/match.test.ts`
- Dev (watch): `npm run dev`  → http://localhost:8080 (WebSocket at `/ws`)
- Start: `npm start`
- Typecheck: `npm run typecheck`
- Redis integration test (needs a Redis on `REDIS_URL`): `npm run test:redis`

## Stack

- **Language:** TypeScript 5.9, strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Run as raw `.ts` — **no build step for engine/server**.
- **Engine/server runtime:** Node ≥ 22; test runner = built-in `node:test`. No framework.
- **Web:** React 18.3, Vite 5.4, `lucide-react` 1.21 (the ONLY icon set — no emoji). No router/state/data library: navigation is a `view` state union in `web/src/App.tsx`; styling is plain CSS (`styles.css`, `landing.css`).
- **Server:** `ws` 8.18 (WebSocket), `pg` 8.13 (Postgres), `redis` 4.7; SQLite via built-in `node:sqlite`. Raw `http`/`ws`, no web framework.
- **Package manager:** npm (lockfile per package). No generated code, no OpenAPI/GraphQL schema.

## Project Map

```
src/                THE rules engine (pure, no deps). Single source of truth.
  index.ts          Public API — import every engine symbol from here.
  rules.ts          createInitialState / legalMoves / applyMove / gameStatus (+ rule docs).
  ai.ts             chooseMove (negamax + alpha-beta), DIFFICULTY_DEPTH / DIFFICULTY_ORDER, evaluate.
  board.ts          Geometry: RC_TO_SQUARE, SQUARE_TO_RC, step(), home squares.
  types.ts          Piece, Column, Board, Move, GameState, GameOutcome.
  notation.ts       FEN-like position encode/decode (used as the repetition key).
test/               Engine + AI tests (rules.test.ts, ai.test.ts).

web/src/            React app. Imports the engine from ../../src/index.ts.
  main.tsx          Entry point.
  App.tsx           Root: view router (landing/game/lasker/replay/brochure) + LocalGame.
  Board.tsx         BoardView + ColumnView — renders the board and columns.
  Landing.tsx, LaskerPage.tsx, ReplayPage.tsx, BrochurePage.tsx   Content/marketing pages.
  games.ts          Historic games replayed through the engine (RawGame list).
  pieceTheme.tsx    Piece insignia themes (Heirloom/Regiment/Lineage/Dots) + <Insignia>.
  Online.tsx, useOnline.ts, net/client.ts   Online play (consumes the server protocol).
  styles.css        Game-board palettes: Navy (default), Stone, Dark, Light, Chocolate, Twilight, Confetti.
  landing.css       Scoped under .landing-page — landing/lasker/replay/brochure styles.

server/src/         Server-authoritative backend (imports engine from ../../../src).
  index.ts, config.ts   Entry; env config (see Gotchas).
  net/protocol.ts   SHARED client/server message types (the web client imports these).
  net/gameServer.ts, net/httpApi.ts   WebSocket game server + REST.
  game/             match.ts, manager.ts, matchmaking.ts.
  storage/          Repository interface (types.ts) + memory/sqlite/postgres + factory.ts.
  cluster/          Presence/queue/routing fabric (types.ts) + memory/redis + factory.ts.
  auth/, rating/elo.ts
  scripts/bot.ts    Guest AI opponent for manual end-to-end testing.
```

Reference docs (point, don't duplicate): `DESIGN.md` (visual/UI source of truth — **read before any UI change**), `TUTORIAL.md` (onboarding plan), `TODO.md` (roadmap/status), and in-app `web/src/BrochurePage.tsx` (canonical written rules).

## Conventions

- **Imports MUST include the file extension** (`./rules.ts`, `./pieceTheme.tsx`, `../../src/index.ts`) — `allowImportingTsExtensions` is on and Node runs the TS directly; omitting the extension breaks at runtime.
- **Named exports only.** The engine re-exports through `src/index.ts`; components are `export function Foo`. No default exports, no import aliases — use relative paths.
- Import engine symbols from `src/index.ts`, never from `src/rules.ts` etc. directly.
- **Naming:** engine/server files lowercase, `camelCase` for multiword (`gameServer.ts`); web React components `PascalCase.tsx` (`Board.tsx`); non-component web modules `camelCase` (`games.ts`, `useOnline.ts`).
- **New web page/view:** copy `web/src/LaskerPage.tsx` or `ReplayPage.tsx`, then add it to the `view` union and the conditional renders in `web/src/App.tsx`.
- **New historic game:** add a `RawGame` to `web/src/games.ts` — it must validate through the engine (it throws on the first illegal ply) or it's a real bug.

## Golden-Path Examples (copy these)

- Engine rule change → `src/rules.ts` + add a case to `test/rules.test.ts`.
- AI change → `src/ai.ts` + `test/ai.test.ts`.
- Board / column rendering → `web/src/Board.tsx`.
- Online message or flow → add to `server/src/net/protocol.ts` (shared types) → handle in `server/src/net/gameServer.ts` → consume in `web/src/net/client.ts` + `web/src/useOnline.ts`.
- New storage/cluster backend → implement `server/src/storage/types.ts` (or `cluster/types.ts`), register in that dir's `factory.ts`; `server/test/repository.test.ts` is a contract test run against every backend.

## Data Shapes & Sources of Truth

- Game data shapes → `src/types.ts` (hand-written, not generated).
- Position-string format → `src/notation.ts` (encode/decode docblock).
- Client↔server messages → `server/src/net/protocol.ts` (the web client imports these types directly).
- Storage contract → `server/src/storage/types.ts` (`Repository` interface).
- Rules-of-the-game truth → `src/rules.ts` header comment + `web/src/BrochurePage.tsx`. The engine is validated against Lasker's own 1911 games (replayed in `web/src/games.ts`).

## Boundaries & Off-Limits

- Do not hand-edit `web/dist/` (Vite build output) or anything under `node_modules/`.
- Do not duplicate engine logic into `web/` or `server/` — import `src/`.
- `web/` and `server/` must not import each other's source, except `web/` importing **types** from `server/src/net/protocol.ts`.
- A rules change must update `test/rules.test.ts` and keep `web/src/games.ts` validating (Lasker's games must still replay).

## Gotchas

- Missing `.ts`/`.tsx` import extension → runtime failure. The most common mistake in this repo.
- `server/` needs `--experimental-transform-types` (its package scripts include it); engine/web do not. Use the package scripts, not bare `node`.
- Server dev auth secrets are random per boot → tokens don't survive a restart unless `LASKA_ACCESS_SECRET` + `LASKA_REFRESH_SECRET` are set.
- Server env (all optional locally; defaults in `server/src/config.ts`): `PORT` (8080), `LASKA_DB` (`sqlite`|`memory`|`postgres`, default sqlite → `laska.db`), `LASKA_DB_PATH`, `DATABASE_URL` (postgres), `LASKA_CLUSTER` (`memory`|`redis`), `REDIS_URL`, `LASKA_STARTING_RATING` (1200).
- No lint/formatter exists — nothing will auto-fix style.
- The board's display row 0 is the TOP of the screen; White's home (engine row 0) renders at the BOTTOM (`Board.tsx` inverts `displayRow`). Square index ≠ on-screen row.

## Definition of Done (verification loop)

- **Engine/AI change:** from `./` → `npm run typecheck` → `npm test` (or the single affected `test/*.test.ts`).
- **Web change:** from `web/` → `npx tsc --noEmit` → `npm test` (vitest components) → `npm run test:logic` (pure logic) → run `npm run dev` and verify the affected screen.
- **Server change:** from `server/` → `npm run typecheck` → `npm test`.
- A rules change must additionally keep `web/` typecheck/build green (it imports `games.ts`, which replays Lasker's games).
- Commit often: on a feature branch, commit each coherent, green (typecheck + tests) change as you go — no need to ask first. Never commit directly to `main` (branch first), and push only when asked.

---

## Design System (read `DESIGN.md` before ANY visual or UI change)

Laska uses a **neumorphic** (soft-UI) design system. `DESIGN.md` is the source of truth; these are the non-negotiable rules:

- **Neumorphism via two shadows.** Every surface is sculpted from a light highlight (`--light`, top-left) + a dark shade (`--dark`, bottom-right) — raised, or `inset` for recessed. Never flat drop-shadows, never hard borders.
- **Tokens, not hardcoded colors.** Add to the token set in `web/src/styles.css`; for a neumorphic theme `--ground` must equal `--pedestal`/`--plate` (the board emerges from the same-colour surface, never a contrasting border).
- **Palettes:** Navy (default), Stone, Dark, Light, Chocolate, Twilight, Confetti, via `[data-theme]` on `<html>` (cycled by the theme button, persisted to `laska-theme`). Stone is the bare `:root` (no attribute).
- **Piece insignia themes** (`web/src/pieceTheme.tsx`): rank marks are *debossed* into the coin (coin-tone fill + opposed bevel, never a white painted-on fill). Default Heirloom gives generals a star.
- **Icons: `lucide-react` only** — no emoji, no other icon library.
- **Fonts:** Fraunces (display) + Hanken Grotesk (body). **Spacing:** the `clamp()` scale; responsive on all sizes.

Do not deviate without explicit user approval. In QA, flag anything that doesn't match `DESIGN.md`.

## Maintaining this file

CLAUDE.md is auto-loaded as agent context every session — keep it tight and accurate. Update when commands, the map, env vars, or conventions change; verify every command against the repo before editing, and mark anything unconfirmed `TODO: verify` rather than guessing. A wrong command here costs more than a missing one. (`README.md` is the human-facing doc — keep marketing/story there, not here.)
