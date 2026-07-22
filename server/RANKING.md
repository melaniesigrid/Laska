# Ranking — Glicko-2 + displayed rank ladder

The server is authoritative for ratings: every ranked result is scored server-side
in `game/manager.ts` after the engine validates the game. This is the one contract
tournament code and the frontend should read.

## Glicko-2 (`src/rating/glicko2.ts`)

Glicko-2 (Glickman 2012) tracks three numbers per player:

| Field             | New-player default | Meaning |
| ----------------- | ------------------ | ------- |
| `rating`          | `config.startingRating` (1200) | Elo-scale display value. |
| `ratingDeviation` | `DEFAULT_RD` = 350 | Uncertainty. Shrinks with play, inflates when idle. Floored at `MIN_RD` = 30 after a game, capped at 350. |
| `volatility`      | `DEFAULT_VOLATILITY` = 0.06 | Result erraticness; the volatility solver lets upset streaks widen RD faster. |

Constants: `TAU` = 0.5, `GLICKO2_SCALE` = 173.7178, `STARTING_RATING` = 1200.

**Anchor.** The internal scale is anchored on the configured starting rating, so a
fresh player maps to `mu = 0`:

```
mu  = (rating - anchor) / GLICKO2_SCALE
phi = RD / GLICKO2_SCALE
```

The anchor is a parameter (default `STARTING_RATING` = 1200) — never hardcode
Glickman's 1500. `MatchManager` is constructed with `config.startingRating` as the
anchor.

**Per-game (streaming) update.** We use rating period = 1 game (the Lichess live
approach). `updatePlayer(self, opponent, score, anchor)` runs the full algorithm:
the variance `v` and `delta` steps, the iterative volatility solver (Illinois /
regula-falsi from the paper), the pre-step RD bump, and the new RD/rating, with the
`[MIN_RD, DEFAULT_RD]` clamp. `bothPlayers(white, black, scoreWhite, anchor)` updates
both sides from the same input states. `Score` is `0 | 0.5 | 1`.

**Inactivity.** `inflateDeviation(state, elapsedMs, anchor)` raises RD before a
returning player's game: `phi* = sqrt(phi^2 + c^2 * periods)`, one period =
`RATING_PERIOD_MS` (1 week). `c` (`INACTIVITY_C`) is calibrated so RD climbs from the
floor back to `DEFAULT_RD` over ~52 weeks. Result is capped at `DEFAULT_RD`.

## Per-game flow in `finalize` (ranked, two real users)

1. Snapshot rank **before** via `rankFor` on stored state.
2. `inflateDeviation` each player using `endedAt - lastRatedAt` (skipped if never rated).
3. `bothPlayers(...)` → new states.
4. Persist `rating`, `ratingDeviation`, `volatility`, `ratedGames + 1`,
   `lastRatedAt = endedAt` for each.
5. Snapshot rank **after** via `rankFor` on new state.
6. Return `ratingChange` with per-side `{ before, after, delta, rank: { before, after } }`.

`MatchRecord` still stores the integer rating snapshots (before/after) as before.

## Rank ladder (`src/rating/rank.ts`)

Cosmetic, derived from rating + confidence; never feeds back into matchmaking or the
rating math. **One rank = 100 rating points** (≈ Go's one stone, ≈ 64% win expectancy
for the stronger player). `index` is a monotonic 0..16 ladder position.

| Rating        | Rank        | key          | index |
| ------------- | ----------- | ------------ | ----- |
| < 950         | Recruit     | `recruit`    | 0 |
| 950–1049      | Private     | `private`    | 1 |
| 1050–1149     | Corporal    | `corporal`   | 2 |
| 1150–1249     | Sergeant ←1200 starts here | `sergeant` | 3 |
| 1250–1349     | Lieutenant  | `lieutenant` | 4 |
| 1350–1449     | Captain     | `captain`    | 5 |
| 1450–1549     | Major       | `major`      | 6 |
| 1550–1649     | Colonel     | `colonel`    | 7 |
| 1650–1749     | General ★1  | `general`    | 8 |
| +100 / star … | General ★n  | `general`    | 7+n |
| ≥ 2450        | General ★9 (cap) | `general` | 16 |

`stars` is 0 for climb ranks, 1..9 for General. `progress` is 0..1 toward the next
band's lower bound (1 at the ★9 cap).

**Calibration gate.** A player is `provisional` when `ratedGames < 10` OR
`ratingDeviation > 110`. Promotion into the General tier (any star) is gated on being
calibrated: a provisional player is clamped to **at most Colonel** even if their raw
rating qualifies for General — you cannot fluke into a star off a tiny, high-variance
sample. Once calibrated, the general tier opens up.

## Protocol surface (`src/net/protocol.ts`)

The web client imports these types directly.

- `RankDTO` — structurally identical to `Rank` (re-exported).
- `auth.ok` — adds `ratingDeviation: number` and `rank: RankDTO`.
- `PublicOpponent` — adds `rank: RankDTO` (in `match.start`).
- `RatingChangeDTO` — each side is `RatingChangeSideDTO`:
  `{ before, after, delta, rank: { before: RankDTO; after: RankDTO } }` (in `match.end`).
- HTTP `GET /me` (`toPublicUser`) — adds `rating`, `ratingDeviation`, `rank`.
- HTTP `GET /leaderboard` — each `LeaderboardEntry` carries `ratingDeviation` + `rank`.

## Matchmaking (`src/game/matchmaking.ts`)

Confidence-aware window: `effectiveWindow = baseWindow + windowGrowthPerSec*waitSecs +
rdWindowFactor * ratingDeviation`, clamped to `maxWindow`. `rdWindowFactor` defaults to
0.5, so a maximally uncertain player (RD 350) matches across an extra ±175 immediately.
`QueueEntry.ratingDeviation` is optional (absent ⇒ no widening). The cluster
`QueueMember` carries it; `gameServer` populates it from the user's stored RD.

## Storage

`User` gains `ratingDeviation`, `volatility`, `lastRatedAt`. SQLite/Postgres add
`rating_deviation`, `volatility`, `last_rated_at` columns with idempotent migrations
(SQLite: `PRAGMA table_info` guard; Postgres: `ADD COLUMN IF NOT EXISTS`). New users
(guest + register) default to `DEFAULT_RD` / `DEFAULT_VOLATILITY` / `lastRatedAt = null`.
