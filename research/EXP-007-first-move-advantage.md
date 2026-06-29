# Does moving first win in Laska? An engine-verified investigation

> **Experiment EXP-007.** A presentation-ready write-up of a single research
> question, run entirely against Laska's own rules engine. The lab record (terse,
> append-only) lives in [`research/NOTEBOOK.md`](NOTEBOOK.md); this is the
> narrative version. Reproduce every number with
> [`research/experiments/exp007-colour-advantage.ts`](experiments/exp007-colour-advantage.ts).

## The question

Chess and checkers both give the player who moves first a measurable edge. Laska —
Emanuel Lasker's 1911 column-capturing draughts variant — has almost no strategic
literature, and **nobody has ever measured whether moving first helps.** Because
the same engine that enforces the rules online can also play millions of moves
against itself, we can simply *ask the game*.

## The headline (and the twist)

**The first-move advantage is real — but only at shallow search depth, and strong
play erases it.** It is not a fixed property of the game.

| Search depth | White (first mover) share of decisive games | 95% CI | Verdict |
|---|---:|---|---|
| 4 ply (diverse openings) | **76.9%** | 68.5–83.6% | ✅ significant |
| 4 ply (more diverse) | **66.9%** | 58.0–74.8% | ✅ significant |
| **6 ply** | **45.9%** | 36.8–55.2% | ❌ **vanishes** (CI spans 50%) |

At depth 4, White wins roughly two-thirds to three-quarters of all *decisive*
games. Push the search to depth 6 and the advantage disappears — Black's deeper
calculation fully neutralises White's opening initiative. So the honest, defensible
statement is **not** "Laska has a first-move advantage." It is:

> **First-move initiative converts to wins against weaker calculation, and is
> neutralised by strong play.**

That is itself a useful strategic truth — and it doubles as the reason the game's
AI difficulty tiers exist at all.

## How we know — and the false lead we killed first

This result matters *because of what it replaced.* The first, naive harness
reported the **opposite**: an apparent **80% second-player advantage.** It was
wrong. Two methodology errors produced it:

1. **No colour balancing.** Both players used the same evaluator; any small bias in
   that evaluator showed up as a fake colour effect.
2. **Mid-game random "blunder" noise**, which interacted with the evaluator to skew
   results unpredictably — the apparent winner flipped with search depth and the
   randomness regime.

The rigorous protocol fixes both:

- **Colour-balanced mirror self-play.** The *same* agent plays both sides, so the
  only asymmetry left is who moves first.
- **Diverse but symmetric openings.** Each game starts with a few uniform-random
  plies (symmetric in expectation), then is played out deterministically — so a
  persistent colour skew is a real mover effect, not an opening-selection bias.
- **Confidence intervals.** A Wilson 95% interval on White's share of *decisive*
  games separates signal from Laska's high draw rate.

Notably, the project's existing benchmarking tool was **already colour-balanced on
purpose** — the naive harness had simply ignored a guardrail that earlier work had
put there for exactly this reason. The lesson: *reach for the canonical instrument
before building a new one.*

## Two facts that fell out along the way

Solid, unconditional, and engine-verified:

- **There are exactly 6 legal opening moves** — not the eleven-soldiers-can-move
  intuition. Most front-row soldiers are blocked at the start; only those that can
  step into the empty centre row may move.
- **The centre push `c3-d4` and the wing steps `c3-b4` / `e3-f4` are near-equal at
  depth 8.** The "standard centre opening" is *a* sound choice among near-equals,
  not a uniquely best move.

## Honest caveats

- These are the statistics of *this engine's heuristic playing itself* at a fixed
  depth — strong empirical evidence, **not** a game-theoretic proof. Stated as
  such.
- Laska is genuinely drawish under strong, clean play (≈50% draws at depth 4),
  which is why even a real colour edge does not make the game decisive — *winning
  requires manufacturing imbalance, not merely moving first.* (Whether decisiveness
  rises or falls with depth is a separate open question, EXP-007 O3.)

## Why this is the kind of research worth presenting

The value is not the finding — it is the **discipline.** An AI proposed a
sensational strategic law, then dismantled it with its own engine before it could
reach the book. Laska's strategy book stakes its entire credibility on one claim:
*every line and assertion is verified against the same code that runs the game.*
This experiment is that claim in action — and the reason no competing book can
copy it.

---

*Reproduce:* `node research/experiments/exp007-colour-advantage.ts` (opening scan +
depth-4 study). For the depth-6 leg: `--depth 6 --n 140 --open 4`. Deterministic
given the seeds embedded in the harness.
