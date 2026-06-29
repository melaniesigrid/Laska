# AI-strength benchmark

Measures how strong each AI difficulty tier (`src/ai.ts` `DIFFICULTY_ORDER`:
`beginner … expert`) actually is, by playing the tiers against each other through
the **real engine** and rating the results. It answers "is `hard` really harder
than `medium`, and by how much?" — and doubles as a regression guard: if an AI
change reorders the ladder unexpectedly, you'll see it here.

It reports two things:

1. **Win-rate matrix** — for each pair of tiers, the row tier's score
   (`wins + 0.5·draws`) as a percentage over N games. This is the primary,
   draw-robust artifact.
2. **Glicko-2 ladder** — every result streamed through the production rating
   code (`server/src/rating/glicko2.ts`) and mapped to the military rank ladder
   (`server/src/rating/rank.ts`), so each tier gets a rating, an RD (confidence),
   and a rank.

## Running

From `server/` (no `node_modules` needed — the engine and rating layers are
dependency-free):

```sh
# Quick: round-robin of the human-range tiers (beginner..medium). ~10–20s.
node --experimental-transform-types bench/strength.ts

# Full: all six tiers. The deep tiers (hard, expert) are ~1000× slower per game,
# so they get fewer games. Prints a wall-clock estimate first; expect 30–60 min.
node --experimental-transform-types bench/strength.ts --full

# Reproducible variation:
node --experimental-transform-types bench/strength.ts --seed=42
```

The run is fully deterministic: a fixed seed produces a byte-identical table
every time (every game's RNG is `mulberry32(seed + gameIndex)`; no `Math.random`).

## Why quick vs full

Measured per-game cost: `beginner` ~10 ms, `medium` ~1–2 s, `hard` ~60 s,
`expert` ~100 s. The deep tiers search 6–8 plies with quiescence, so a single
`expert` game can outweigh a thousand `beginner` games. `--quick` keeps the
human-range ladder trustworthy and fast; `--full` is the occasional deep run.

## Method notes

- **Engine-natural termination.** Games end on the engine's own verdict
  (`gameStatus`: no-pieces / no-moves wins, no-progress / threefold draws). A
  generous 400-ply safety cap exists only as a backstop; anything that hits it is
  scored 0.5 **and** counted as `unterminated` (expected: 0). Do not tighten the
  cap — a short cap scores still-live games as bogus draws.
- **`PlayerColor` is `'W' | 'B'`** (not `'white'`/`'black'`). Side-to-move
  dispatch and winner attribution key off that; getting it wrong silently makes
  every game tier-vs-itself, which looks plausible but is meaningless.
- **Streaming Glicko-2.** One game = one rating period (the production approach),
  with the match schedule interleaved so no single pairing dominates convergence.

## Latest measured ladder (`--quick`, default seed)

```
--- Win-rate matrix (cell = row tier's score% vs column; n = games) ---

vs              beginner      easy intermedi    medium
beginner               —        0%        0%        8%
easy                100%         —       23%        8%
intermediate        100%       77%         —       17%
medium               92%       92%       83%         —

  games per pair: 24

--- Glicko-2 ladder (sorted by rating) ---

  tier           rating    RD  rank                 W   L   D  games
  ----------------------------------------------------------------------
  medium           1569    86  Colonel             61   5   6     72
  intermediate     1358    76  Captain             45  24   3     72
  easy             1208    79  Sergeant            29  38   5     72
  beginner          732   122  Recruit ?            2  70   0     72

  total games: 144   wall-clock: ~18s   unterminated: 0
```

The four fast tiers come out cleanly monotonic by design strength — the
correctness sanity gate for this benchmark. (`hard`/`expert` sit above `medium`;
run `--full` to place them, where they remain provisional until enough deep games
accumulate.)
