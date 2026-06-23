# The Laska AI — engineering notes

A code-grounded walkthrough of the opponent in [`src/ai.ts`](src/ai.ts). Everything
here is traceable to the source; where a number is measured it says so, and where
something is *not yet* confirmed it says that too. Game-state and move-generation
logic in [`src/rules.ts`](src/rules.ts) is sacred — the AI only reads it.

---

## 1. What the engine is

The opponent is a **negamax search with alpha-beta pruning** over the column-aware
move generator in `rules.ts`, scored by a **Laska-specific static evaluation**. It
is pure and standalone: it imports only the rules engine, so the same code runs in
the browser for offline play and on the server as a bot fallback
(`server/scripts/bot.ts`).

Public surface (`src/ai.ts`, re-exported by `src/index.ts`):

| Symbol | Role |
| --- | --- |
| `evaluate(state, me, w?)` | Static score of a position from `me`'s view |
| `scoreMoves(state, depth, opts?)` | Exact score for every legal root move |
| `chooseMove(state, opts?)` | Pick a move for the side to move |
| `DIFFICULTY_DEPTH` / `DIFFICULTY_ORDER` | Tier → search depth, in plies |
| `SearchStats` / `newStats()` | Optional node-count instrumentation |

### Call flow

```
chooseMove(state, opts)
  ├─ legalMoves(state)                      // 0 moves → null; 1 move → return it
  ├─ blunder roll (per-difficulty)          // lower tiers sometimes play random
  └─ scoreMoves(state, depth, {weights, quiescence})
        └─ for each ordered root move:
             negamax(applyMove(state, move), depth-1, -∞, +∞, cfg, ply=1)
                 ├─ legalMoves(child)        // generated ONCE per node
                 ├─ no moves → loss          // -(WIN - (100-depth))
                 ├─ threefold / no-progress → draw (0)
                 ├─ depth ≤ 0 → evaluate()   // unless quiescence extends
                 └─ recurse over children, negating each child score
```

`scoreMoves` searches each root move under a **full (−∞, +∞) window** so every move
gets an *exact* score — needed for honest analysis and reliable tie detection in
`chooseMove`. Alpha-beta still prunes deep inside each child subtree.

### The negamax identity (why one routine serves both players)

Laska is zero-sum: a position good for White is exactly as bad for Black. Negamax
exploits `max(a, b) = −min(−a, −b)` — the parent negates each child's returned
score, so a single routine always scores *from the side to move*. Concretely
(`src/ai.ts`):

```ts
const score = -negamax(child, depth - 1, -beta, -alpha, cfg, ply + 1);
```

This is **only correct if the static evaluation is symmetric**: it must be true
that `evaluate(s, W) === -evaluate(s, B)`. If it weren't, the sign-flip on the way
up the tree would be comparing two differently-calibrated scales and the search
would chase phantom advantages. Our `evaluate` *is* antisymmetric — see §3.

---

## 2. Move generation it relies on (read-only)

From `rules.ts`, unchanged by the AI:

- **Mandatory capture.** `legalMoves` returns **only** captures if any capture
  exists anywhere; otherwise only quiet moves. So at any node, if the first move
  is a capture, *every* move is — the side to move has no choice but to capture.
  This single fact shapes both the search (low branching) and the quiescence
  design (§4).
- **Maximal capture chains.** `captureSequencesFrom` returns complete jump
  sequences; promotion ends a chain immediately, even mid-jump.
- **Permanence.** Captures bury, never remove. Every position always has all 22
  starting pieces on the board (asserted by `test/ai.test.ts`). "Material" is
  therefore *column control*, not piece count — see §3.

The low, capture-driven branching factor is why modest depths play a strong game,
and why deep search stays cheap (§5).

---

## 3. Evaluation (`evaluate`)

Scored from `me`'s perspective, summed over every occupied square. Weights live in
`DEFAULT_WEIGHTS` and are **reasonable, not yet match-tuned** (the code says so):

| Weight | Default | Meaning |
| --- | --- | --- |
| `column` | 100 | Controlling a column at all ("a piece in play") |
| `officer` | 60 | Your commander is a promoted officer (moves both ways) |
| `enemyPrisoner` | 18 | Each cross-colour piece buried under a commander (symmetric) |
| `advance` | 6 | Per row a soldier-topped column has advanced toward promotion |
| `mobility` | 2 | Per legal move of difference (`myMoves − theirMoves`) |

For each column, `sign = +1` if `me` controls the top, else `−1`, and the column,
officer, prisoner and advancement terms are all multiplied by `sign`. Mobility is
`w.mobility * (myMoves − theirMoves)`. Because every term flips sign with the
controller and mobility is a difference, **`evaluate` is exactly antisymmetric**
(`evaluate(s, W) === −evaluate(s, B)`), which is what negamax requires.
`test/ai.test.ts` checks the controller of more material scores positive and the
other negative.

**Finding (fixed) — a dead weight that *should* stay dead.** The original
`DEFAULT_WEIGHTS` carried `ownCaptured: 12`, documented as a smaller penalty for
your own pieces buried under an enemy ("fear your losses less than you prize
captures"). It was referenced nowhere — the buried-piece loop only ever applied
`enemyPrisoner`. The instinct is to "finish wiring it in," but that would be a
**bug**: a buried piece is one physical object that is an asset to its captor and
a liability to its owner. Scoring those two at *different* magnitudes
(`enemyPrisoner` 18 vs `ownCaptured` 12) makes `evaluate(s, W) ≠ −evaluate(s, B)`
— it breaks the antisymmetry the negamax sign-flip depends on, so the search would
compare two miscalibrated rulers. The correct fix is therefore **removal**, which
is what this work did: the field is gone and the constraint is documented in the
`EvalWeights` doc comment.

**Cost note.** `evaluate` calls `legalMoves` twice per leaf (mobility for both
sides). That is the dominant per-node cost at low depth — see §5.

---

## 4. Optimisations: present, added, and deferred

### Present before this work
- **Negamax** with the correct sign-flip and a symmetric evaluation.
- **Alpha-beta pruning** inside every child subtree, with a depth-offset mate
  score (`−(WIN − (100 − depth))`) so the engine prefers mating sooner / being
  mated later.
- **Static move ordering** (`orderMoves`): captures first, then longer capture
  chains, then promotions — ordering the likely-best moves early to maximise cuts.
- **Difficulty as depth + blunder rate**: tiers set search depth (1–8 plies) and a
  probability of a deliberate random move so lower tiers are beatable and human.

### Added in this work (all behind flags; defaults reproduce the old engine bit-for-bit)
- **Fused move generation.** The old node called `gameStatus` (which itself
  generates all legal moves to test for stalemate) *and then* generated moves
  again to recurse — two full generations per interior node. The new `negamax`
  generates **once** and reuses the list for the terminal test, the draw test and
  the move loop. Pure speedup; `test/ai.test.ts` proves identical scores against a
  frozen reference negamax across a whole game (the **PARITY** test).
- **Quiescence (forced-capture extension).** Because captures are mandatory, a leaf
  that *still has a capture available* is a position caught mid-swap — evaluating
  it is a lie (the classic **horizon effect**). With `quiescence: true`, when a
  leaf's moves are captures the search extends through the forced exchange
  (without spending main depth, capped at `maxQuiescencePly = 12`) until the
  position is quiet, then evaluates. This **changes the engine's judgement**, so it
  is opt-in and wired only to **Hard and Expert**. The test suite confirms it (a)
  alters the leaf score somewhere in real play and (b) leaves lower tiers
  unchanged.
- **Instrumentation.** An optional `SearchStats` sink counts nodes, leaves,
  cutoffs and max ply reached, so the in-app explainer and the benchmark report
  *measured* numbers rather than estimates.

### Deferred (designed, not shipped — with reasons)

| Optimisation | Effort | Impact here | Risk | Why deferred |
| --- | --- | --- | --- | --- |
| **Transposition table** (Zobrist or `encodePosition` key) | Med | **Low** at current node counts (hundreds–thousands of nodes; few transpositions) | Med | Our draw scoring is *path-dependent* (threefold + no-progress live in `positionCounts`/`plyNoProgress`, not in the board key). A naive board-keyed TT can return a cached score that ignores a repetition and mis-score a draw. Correct keying needs the path state folded in. Not worth the correctness risk for a small win — **measure first**. |
| **History / killer move ordering** | Low | Low–Med (ordering is already good via forced captures) | Low | Safe and cheap; would improve cut rate in quiet midgames. Good next step. |
| **Iterative deepening + time budget** | Med | UX (think *N ms* instead of fixed depth) + better ordering | Low | Mostly a UX/ordering win; current fixed-depth play is already fast. |
| **Evaluation tuning** (re-weight the 5 surviving terms) | Med | **High** (strength comes from a better leaf score, not more nodes) | Med | Needs a game corpus / self-play harness to tune against, not guesswork. Any new term must stay antisymmetric (see §3). |

The honest summary: this engine's bottleneck is **per-node evaluation cost**, not
search width, so the high-leverage future work is **a sharper, tuned evaluation**
(and quiescence, now shipped) — not a transposition table.

---

## 5. Measured baseline & after

Measured with [`bench.ts`](bench.ts) (`node bench.ts`) on the dev machine; treat
all timings as **approximate and machine-dependent — re-run them yourself** before
quoting. Node counts are exact and reproducible.

<!-- BENCH:START — regenerate with `node bench.ts` -->
**Opening position, production search (alpha-beta on):**

| Depth (plies) | Nodes | Leaves scored | Beta cutoffs |
| --- | --- | --- | --- |
| 1 | 6 | 6 | 0 |
| 2 | 12 | 6 | 0 |
| 3 | 30 | 18 | 0 |
| 4 | 82 | 52 | 9 |
| 6 | 287 | 146 | 43 |
| 8 | 1,470 | 795 | 309 |

**Alpha-beta vs plain negamax** (opening, depth 6): 287 nodes vs 524 — **~45 % pruned**.
The cut rate is modest precisely *because* forced captures already keep branching
low; pruning helps more as quiet midgames widen the tree.

**Quiescence cost** (a ~16-ply midgame position, depth 8): plain 1,003 nodes / ~11 ms
→ quiescence 2,514 nodes / ~20 ms, extending from maxPly 8 to **maxPly 18** (1,116
extra capture nodes). The horizon fix roughly doubles the work in tactical
positions and is invisible in quiet ones.

**Per-move cost at Expert** (depth 8, self-play sample): **~17 ms/move average, ~68 ms
worst, ~2,250 nodes/move** — comfortably interactive; no UI throttling needed.

**Strength probe** (quiescence vs plain, *both* depth 4, 6 games, blunder-free):
quiescence **3**, plain **1**, 2 draws/caps. This is a *directional* small sample,
not a win rate — see the caveat below.

> ⚠️ All timings are machine-dependent and approximate — re-run `node bench.ts`
> on your target hardware. The strength probe is far too small to publish as a
> win rate; a proper assessment needs a few hundred games across seeds and depths
> (the roadmap already flags "AI strength benchmarking" as not yet done). Node
> counts and node-ratios are exact and reproducible.
<!-- BENCH:END -->

---

## 6. Known weaknesses & honest trade-offs

- **Horizon effect** — mitigated, not eliminated. Quiescence (Hard/Expert) extends
  through *forced captures*, but a quiet positional threat one ply past the horizon
  is still invisible. Lower tiers have no quiescence at all (by design).
- **Untuned evaluation.** Weights are hand-picked, not fit to data. (The one
  documented "asymmetry" idea was removed, not implemented — it would have broken
  negamax; see §3.)
- **Endgame shallowness.** No endgame tablebase or extension; deep forced wins past
  the search horizon can be missed at the lower tiers.
- **No transposition reuse** — see §4 for why this is a deliberate, correctness-led
  choice, not an oversight.
- **Repetition is path-dependent** and lives outside the board key, which is
  exactly what makes a naive TT unsafe.

Any change to search behaviour must keep the **PARITY** test green (optimisations
off ⇒ identical scores to the frozen reference) and must not regress
`web/src/games.ts` (Lasker's 1911 games must still replay move-for-move).

---

© Melanie Baratto — https://github.com/melaniesigrid
</content>
</invoke>
