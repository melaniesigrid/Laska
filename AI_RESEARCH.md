# Laska AI — Assessment, Approaches, Roadmap & the Agent Research Layer

> Grounded review of the Laska opponent AI plus a pluggable framework for
> building and **comparing** multiple AIs (so we can do real AI research).
> Engine correctness is never touched — everything here is move-selection only.
>
> **Accuracy note:** measured numbers below were produced on this machine from
> *this* engine (`bench-baseline.ts`, `arena-run.ts`) and are reproducible.
> Where I cite outside literature I name it and flag it for you to verify against
> the primary source. Where I do not have a verifiable figure I say so.

---

## 1. Current-state assessment (confirmed from the code)

The shipping AI lives in [src/ai.ts](src/ai.ts). It is:

- **Negamax with alpha-beta pruning** — one routine for both sides via the
  negamax identity; a symmetric, column-aware evaluation.
- **Move ordering** — captures first, then longer capture chains, then
  promotions. (Good cuts, since forced captures dominate.)
- **Quiescence search** — an opt-in forced-capture extension at the leaves that
  fixes the horizon effect (don't score a position mid-exchange). On for the top
  tiers only.
- **Laska-specific evaluation** — *column control* (100), officer bonus (60),
  enemy prisoners held (18), own pieces buried (−12), soldier advance toward
  promotion (6/row), mobility (2 × move-count diff). The header correctly notes
  "material" in Laska is **column control**, not piece count (captures bury,
  never remove).
- **Difficulty via depth + blunder rate + quiescence** — `beginner…expert`
  mapped to depths 1/2/3/4/6/8, blunder rates 0.5→0, quiescence off until `hard`.
- **Tie-break randomization** — picks uniformly among equal-best moves for variety.

**What it does NOT have (confirmed absent):** transposition table / Zobrist
hashing, iterative deepening, time-budgeted search, opening book, endgame
tablebase, or any tuned/learned evaluation (weights are self-described as
"reasonable, not yet match-tuned").

### Measured computational profile (the single most important fact)

From `bench-baseline.ts`, opening position, full-window-per-root:

| depth | nodes | time |
|------:|------:|-----:|
| 4 | 82 | 3.3 ms |
| 6 | 287 | 7.4 ms |
| 8 | 1,470 | 21.9 ms |

Mid-game self-play at depth 8 averaged **~16 ms/move (~1,823 nodes/move)**.

**The branching factor is tiny** because captures are mandatory (when a capture
exists, *every* legal move is a capture). The whole tree is small. **Implication:
the engine is massively under-utilizing available compute** — depth 8 costs
milliseconds, so the strong tiers could search far deeper essentially for free.
*(These numbers are from this engine's early/mid game; I have not characterised
pathological late positions — treat the branching claim as measured-for-opening,
not a proof for all positions.)*

### Probable weaknesses

- **Leaves depth on the table.** The highest tier (depth 8) stops while
  10–14-ply searches would still run in well under a typical move budget.
- **No iterative deepening / time control.** Move time varies with position and
  there is no "use up to N ms" mode — awkward for a responsive UI and for giving
  stronger tiers more thinking time safely.
- **Untuned evaluation.** Weights are reasonable guesses. No back-rank/anti-promotion
  term, no tempo term, no explicit center-row (the empty middle rank) control.
- **Predictability at the top.** Expert has blunder rate 0 and only tie-break
  randomness; strong but a fixed style.
- **Strength is not externally benchmarked.** We have no comparison to a
  reference Laska engine (the roadmap flags this). The arena below measures
  **relative** strength between our own agents, which is the right first step.

### Open questions for you (don't want to assume)

1. **Move-time budget** per tier on the **slowest target device** (mobile web)?
   Depth 8 is ~16 ms on this laptop; mobile is slower but still has large
   headroom. A budget lets me convert "depth" tiers into "think for N ms" tiers.
2. **Capture rule** is implemented as **free choice** (validated against Lasker's
   own 1911 games). If a competition ruleset you target uses strict
   maximum-capture, the move generator — and therefore every agent — changes.
3. Do you want a **learning-based** agent as a research showcase, knowing it needs
   training infrastructure and is likely *overkill* for this game (see §3)?

---

## 2. The agent research layer (built — `src/agents/`)

To "make multiple AIs and compare them," I added a thin **pluggable-agent**
framework that is completely separate from the engine. Every agent implements one
interface and can be played head-to-head in a seeded, reproducible **arena**.

```
src/agents/
  agent.ts      Agent interface { id, name, blurb, family, chooseMove(state, ctx) }
  rng.ts        seedable PRNG (mulberry32) — reproducible games & tests
  random.ts     RandomAgent   — uniform legal move (research floor)
  greedy.ts     GreedyAgent   — 1-ply, material-only heuristic (no lookahead)
  search.ts     SearchAgent   — wraps the EXISTING negamax+α-β (no second engine)
  mcts.ts       MctsAgent     — Monte Carlo Tree Search w/ UCT (a different algo)
  registry.ts   the named roster + difficulty ladder
  arena.ts      playGame / playMatch / roundRobin (seeded, colour-alternating)
  index.ts      public surface for the research layer
arena-run.ts    runnable tournament dashboard
test/agents.test.ts   legality, determinism, ordering, arena sanity (10 tests)
```

**Design choices that matter for research validity:**
- **Seeded RNG everywhere** → a tournament is byte-for-byte reproducible.
- **Colours alternate every game** → cancels White's first-move advantage.
- **SearchAgent reuses `scoreMoves` from `ai.ts`** → the research search and the
  shipping search can never silently diverge.
- **Agents are kept, never overwritten** → add a new AI by adding a file +
  registry entry, so any past comparison stays reproducible.

### Run it

```bash
node arena-run.ts                       # ladder, 20 games/pairing
node arena-run.ts --games 40            # tighter estimates
node arena-run.ts --agents cadet,viktor,monte
node arena-run.ts --all                 # include the MCTS wildcard (slower)
```

---

## 3. Approaches catalogue (ranked by fit for *this* game)

| Approach | Verdict for Laska | Why |
|---|---|---|
| **Alpha-beta negamax (current)** | ✅ **Best ROI** | Tiny branching + a hand-writable eval ⇒ deep search is cheap and strong. The right backbone. |
| **+ iterative deepening + TT + tuned eval** | ✅ **Where to invest** | Incremental, low-risk, directly raises ceiling. See roadmap §4. |
| **MCTS / UCT** | ✅ **Surprisingly competitive** (measured) | I *expected* it to be weak (tactical, forced-capture game with a good eval should favour exact search). The arena overturned that: `Monte` (2000 iters) beat random 8–0 and **took 3 of 8 games off depth-6 Viktor**. Caveat: it is **much slower per move** than α-β. A strong stylistic opponent *and* a real strength contender. |
| **Pure greedy / heuristic** | ⚠️ Low tiers only | **Measured ≈ random** in Laska (captures bury, not remove). Good for "feel," not strength. |
| **Hybrid search + learned eval / AlphaZero family** | ❌ **Overkill for product** | Needs a self-play + training pipeline (GPU, framework). A 7×7 game where shallow α-β already plays well doesn't justify it. Reasonable only as a research showcase. |
| **Endgame tablebases** | ❓ **Feasibility unverified** | Stacking explodes the state space (a square holds an ordered stack), so full tablebases are probably infeasible — **I don't have a verified Laska state-space count; compute it before assuming**. Low-piece endgames *might* be tractable; verify first. |

**Named-technique citations (verify against primary sources):**
- Minimax / alpha-beta / quiescence / transposition tables / iterative deepening
  — standard, well-established game-tree search.
- **UCT** — Kocsis & Szepesvári, *"Bandit based Monte-Carlo Planning"*, ECML 2006.
- MCTS survey — Browne et al., *IEEE T-CIAIG*, ~2012.
- AlphaZero family — Silver et al. (DeepMind), ~2017–2018.
  I am confident these works exist and introduce/survey what I attribute to them,
  but confirm exact titles/years before citing them publicly. **State of the art
  in learning-based game AI may have advanced since my knowledge cutoff — check
  current literature before committing to that path.**

---

## 4. Improvement roadmap (effort → impact, incremental before any rewrite)

Ordered by ratio. None of these touch the rules engine.

1. **Search deeper on the strong tiers — nearly free (highest impact, lowest effort).**
   Depth 8 is ~16 ms; raise `expert` toward depth 10–14. Verify per-move cost on
   the slowest target device first.
2. **Iterative deepening + a move-time budget.** Search depths 1,2,3,… until a
   time cap, return the best so far; feed each iteration's best move to the top of
   the next iteration's ordering. Gives smooth, bounded move times and lets tiers
   be defined as *think-for-N-ms* rather than fixed depth.
3. **Transposition table (Zobrist hashing).** Modest gain given low node counts,
   but it compounds with iterative deepening (reuse across iterations). Medium
   effort; measure before/after with `SearchStats` (already in `ai.ts`).
4. **Evaluation tuning via the arena.** Weights are untuned. Use self-play
   round-robins (the arena) + coordinate-ascent / hill-climbing to tune; consider
   CMA-ES (Hansen) if you want a proper optimizer — *verify the library*. Add
   Laska-specific terms: anti-promotion / back-rank defense, tempo, center-row
   (empty middle rank) control, tall-column safety.
5. **Opening book** from Lasker's 1911 games (already in `web/src/games.ts`) +
   self-play, to remove early-game randomness and add character.
6. **Endgame handling.** First verify tablebase feasibility (state-space count);
   if infeasible, add conversion heuristics and no-progress-counter awareness so
   winning material edges actually get converted before the draw counter.
7. **(Research only, resource-gated) learned policy/value net.** Only if you want
   an AlphaZero-style showcase and can stand up training infra. Likely
   unnecessary for product strength.

**Quick wins = 1 + 2.** They raise the ceiling and fix move-time UX with little
code and zero engine risk.

---

## 5. Difficulty + personality ladder (each tier = a real lever)

Every rung is a distinct **engineering decision**, and the playstyle is felt in
move selection, not just flavour text. Defined in [src/agents/registry.ts](src/agents/registry.ts).

| Rung | Name | Lever (algorithm + knobs) | Personality (how it *feels*) |
|---|---|---|---|
| Floor | **Cadet** | RandomAgent | Aimless but legal; throws pieces forward and hopes. |
| 1 | **Pip** | GreedyAgent — 1-ply, material-only | Eager novice; grabs every capture, never sees the trap. |
| 2 | **Margot** | SearchAgent depth 3, blunder 0.12, no quiescence | Cautious club player; solid, unflashy, occasionally distracted. |
| 3 | **Viktor** | SearchAgent depth 6 + quiescence, blunder 0.01 | Calculating tactician; reads exchanges, punishes loose play. |
| 4 | **Dr. Lasker** | SearchAgent depth 10 + quiescence, blunder 0 | The master; patient, deep, plays for the long structural win. *(Homage to the inventor, Emanuel Lasker.)* |
| ~3–4 | **Monte** | MctsAgent (UCT, 2000 iters) | Stylistic wildcard — a *different algorithm* (sampled futures). **Now measured: competitive with Viktor** (won 3/8 vs depth-6), well above greedy/random — but much slower per move. |

**Why personalities differ, not just strengths:** Pip is capture-greedy with no
foresight; Margot occasionally wanders (blunder rate); Viktor is sharp and
tactical (quiescence reads the exchange to the end); Dr. Lasker is positional and
relentless; Monte plays an entirely different *kind* of move (sampled futures),
so it feels human-but-alien in a way the searchers don't. This is the design
goal: **a stronger AI that played identically to a weaker one would be a worse
product** — feel is a first-class design lever here.

### A documented research finding (from the arena)

**Greedy ≈ Random in Laska.** Pure material-grabbing (Pip) is barely better than
random (Cadet) over small samples — went 5–5 in one 10-game match. This is *not*
a bug: captures only **bury** enemy pieces under your commander, they never
remove them, so naive "grab material" has weak signal. The robust, stable
ordering is **search ≫ greedy ≈ random**, which is why the test suite asserts
`Viktor ≫ Pip` rather than the brittle `Pip > Cadet`.

---

## 6. Measured tournament results

> Reproduce with `node arena-run.ts --games 30 --seed 7` (from `Laska/`).
> _Table inserted from the live run below._

**Core ladder — 30 games/pairing, seed 7 (`--agents cadet,pip,margot,viktor`):**

| # | Agent | Pts | W | D | L | Win% |
|--:|---|--:|--:|--:|--:|--:|
| 1 | Viktor (search d6+quiesce) | 90.0 | 90 | 0 | 0 | 100% |
| 2 | Margot (search d3, blunders) | 60.0 | 60 | 0 | 30 | 67% |
| 3 | Pip (greedy 1-ply) | 19.5 | 19 | 1 | 70 | 21% |
| 4 | Cadet (random) | 10.5 | 10 | 1 | 79 | 11% |

A clean monotonic ladder — strength rises exactly with the lever. Head-to-head,
**Pip beat Cadet 19–10** over 30 games (greedy *is* weakly better than random
over a larger sample) yet **lost every single game to Margot and Viktor** — the
"search ≫ greedy ≈ random" story. Viktor (depth 6 + quiescence) **dropped zero
games** to everything below it.

**MCTS wildcard — `--agents cadet,viktor,monte`, 8 games/pairing, seed 7:**

| # | Agent | Pts | W | D | L | Win% |
|--:|---|--:|--:|--:|--:|--:|
| 1 | Viktor (search d6) | 13.0 | 13 | 0 | 3 | 81% |
| 2 | **Monte (MCTS, 2000 iters)** | 11.0 | 11 | 0 | 5 | 69% |
| 3 | Cadet (random) | 0.0 | 0 | 0 | 16 | 0% |

**The headline research result: MCTS is competitive here, against expectation.**
Monte crushed random 8–0 (cleaner than Pip's 19–10) and **won 3 of 8 vs depth-6
Viktor**. My prior was that a tactical forced-capture game would punish random
rollouts — the arena proved otherwise. **Cost caveat:** this 3-way (with 2000-iter
MCTS) took ~28 min vs ~67 s for the four α-β/greedy/random agents — MCTS is
*far* slower per move and would need rollout/iteration tuning for product use.

_Dr. Lasker (depth 10) vs Viktor is still measuring; row appended when it lands._


---

## 7. Guardrails honored

- **No invented sources.** Every technique named is real; citations flagged for
  your verification; uncertainties stated plainly ("I do not have a verifiable
  Laska state-space count").
- **Engine untouched.** All work is move-selection; `npm run typecheck` + the
  rules/AI suites stay green; agents only ever return moves from `legalMoves`.
- **Resource-aware.** The recommended path is *deeper classical search + tuning*,
  not a learning rewrite the project has no infrastructure for.
