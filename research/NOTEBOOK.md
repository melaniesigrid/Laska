# Laska — Research Notebook

An append-only lab notebook for experiments run on Laska, mostly via the
`.claude/agents/` engineering subagents. Two research threads run in parallel:

- **Thread A — Laska game AI.** Strength benchmarking, evaluation-function
  tuning, search behavior, the column-capture game's draw dynamics.
- **Thread B — agent methodology (meta).** Do charter-scoped subagents do
  disciplined engineering science? Does handing a finding back to the same
  agent produce better work than a fresh spawn? This thread is *about* the
  process, and is potentially the more novel paper.

## Conventions (keep entries reproducible)

- **Append only.** Never rewrite a past entry; correct it in a later one.
- Every entry: date · experiment ID · thread · who ran it (which subagent) ·
  hypothesis · **method with exact commands + seeds** · result (verbatim
  numbers) · interpretation · open questions · repo ref (`git short-sha`).
- Numbers must be **reproducible**: record the seed(s), N (games), and the exact
  command. If a result is seed-sensitive, that *is* the finding — say so.
- Separate **observation** from **interpretation**. Don't let a hoped-for
  conclusion launder a thin result.
- Independent verification (main loop re-running a subagent's claim) is logged
  as its own line — trust, but verify.

---

## EXP-001 — Self-play strength benchmark (build + first baseline)
- **Date:** 2026-06-22 · **Thread:** A (+ B) · **Run by:** `game-ai-engineer` · **Repo:** `2b194e9` (untracked working tree)
- **Motivation:** TODO.md flags "AI strength is not benchmarked … heuristic weights are reasonable defaults, not tuned." No instrument existed to measure strength or catch regressions.

**Hypothesis (implicit):** The difficulty ladder (depth-keyed tiers) is monotonic — a deeper-searching tier reliably beats a shallower one.

**Method:** Built `Laska/bench-strength.ts` — a self-play harness over the production tiers (`chooseMove` driven by `DIFFICULTY_ORDER`/`DIFFICULTY_DEPTH`). Color-balanced (each pairing splits colors so White's first-move edge cancels). Deterministic via the repo's seeded mulberry32 RNG threaded into `chooseMove`. Termination by engine `gameStatus` + hard `--cap` ply limit (draw fallback) + per-game wall-clock guard. Flags: `--games --tiers --full --adjacent --cap --seed --no-blunder --budget`.
- Smoke: `node bench-strength.ts` (default, ~4–7s, deep tiers excluded).
- Wider: `node bench-strength.ts --games 10` (120 games, ~22s).

**Result (verbatim):**
- Default smoke (N=2): `beginner 0% · easy 33% · intermediate 75% · medium 67%`. Monotonicity check: "OK." But **intermediate (depth 3) out-scored medium (depth 4) in standings.**
- N=10 (120 games): `beginner 2% · easy 30% · intermediate 70% · medium 83%`, monotonic.
- Seed sensitivity: at seed 99, medium led 83% vs 67%; at the N=2 smoke seed, intermediate led. The intermediate-vs-medium head-to-head is **near a coin-flip and seed-dependent.**
- Cost (`bench-baseline.ts`, depth 8): ~1,823 nodes/move, ~58 ms/move. `expert` ≈ 36 ms/ply.

**Independent verification (main loop):** Re-ran `node bench-strength.ts`; reproduced `beginner 0 · easy 33 · intermediate 75 · medium 67`, 24 games, 139,581 nodes, 4.1s. Typecheck clean; tests green (47).

**Findings:**
1. **A1 — The depth-3→depth-4 step buys almost no real strength.** This is the headline. More search does not (yet) convert to wins, which points at the *evaluation function*, not the search.
2. **A2 — Laska games between strong tiers rarely terminate decisively.** Captures *bury* pieces (nothing leaves the board), so near-best play drifts to the ply cap rather than a `gameStatus` win. This is a genuine property of the game's draw dynamics, not a harness bug. It's why `hard`/`expert` are gated behind `--full` and why the cap + wall-clock guard are load-bearing.
3. **B1 (meta) — The charter steered behavior.** The agent stayed read-only on the engine, preserved determinism, gated the slow tiers, and *surfaced finding A1 instead of declaring success*. All charter constraints held without re-prompting.

**Caveat logged:** `bench-baseline.ts` was untracked and vanished mid-session; the agent restored it "byte-for-byte from the copy I had read." Exists and runs, but the byte-identity claim is unverified against an original. Flag if it ever behaves oddly.

**Open questions → became EXP-002:** Which eval terms are mis-weighted such that depth-4 can't out-convert depth-3? Candidates named by the agent: column-command vs material vs mobility vs promotion-distance.

---

## EXP-002 — Tune `evaluate` so depth-4 reliably beats depth-3
- **Date:** 2026-06-22 · **Thread:** A (+ B) · **Run by:** `game-ai-engineer` (resumed, context intact) · **Status:** IN PROGRESS (background)
- **Hypothesis:** The near-tie in EXP-001 is an *evaluation* problem, not a search problem. Re-weighting eval terms in `src/ai.ts` (without changing search depth) will let the deeper tier convert its extra search into wins.
- **Pre-registered bar (set before running):** `medium` ≥ 65–70% head-to-head vs `intermediate` across ≥3 seeds at a solid N, AND the full ladder stays monotonic (beginner < easy < intermediate < medium) on every seed.
- **Method:** BEFORE multi-seed baseline (`--seed 1/2/3`) → hypothesize which terms are off → change *weights only* (depth fixed at d3 vs d4, so we're measuring whether deeper search converts) → iterate against `bench-strength.ts` on the same seed set (no cherry-picking) → AFTER battery on the same seeds. Guardrails: engine untouched, determinism preserved, low end of ladder re-checked, `bench-baseline.ts` cost must not blow up.
- **Result:** _pending — fill in from the agent's report (before/after matrices, weight old→new, tradeoffs, verify)._

**Meta-question being tested (B):** Does handing an agent *its own finding* back (resume with context) yield better follow-through than a cold spawn? Compare the quality/discipline of this run against EXP-001.

---

## Findings ledger (running index)

| ID | Thread | Claim | Status |
|----|--------|-------|--------|
| A1 | game AI | depth-3→depth-4 buys ~no strength (eval-bound, not search-bound) | observed, EXP-001; under test in EXP-002 |
| A2 | game AI | strong-tier games rarely terminate (capture buries, never removes) | observed, EXP-001 |
| B1 | methodology | charter constraints steer agent behavior without re-prompting | observed once, EXP-001 |

---

## EXP-003 — Player-game corpus: a (state, action, return) substrate from saved games
- **Date:** 2026-06-23 · **Thread:** A (data substrate) · **Run by:** main loop (saved-games feature) · **Repo:** branch `feat/saved-games` off `main`
- **Motivation:** Strength work so far (EXP-001/002) is *self-play* against the engine's own heuristic. There was no corpus of *played* games — human-vs-AI or hotseat — to mine for openings, blunders, or value targets. The new "save & rewatch" feature records every local game; this entry documents the pipeline that turns that history into training data, and what it is **not** yet allowed to do.

**Hypothesis (to be tested later):** Real played games carry signal self-play doesn't — human opening preferences and recurring losing patterns — usable for (a) an opening book and (b) value-target supervision, without retuning the negamax weights (which EXP-002 found at a local optimum).

**Method (build, not yet a result):**
- `web/src/savedGames.ts` — saved games store *only* moves (`from/to/captures` + per-ply notes), never board snapshots; positions are reconstructed by replaying through the **real engine** (`rebuildGame`), exactly as `games.ts` validates Lasker's games. A move that won't replay throws — the save is corrupt or the ruleset drifted, surfaced, never papered over.
- `web/src/training.ts` — `buildTrainingCorpus(games)` emits one sample per ply: `position` = engine canonical string (`encodePosition`, the repetition key) of the state *before* the move, `move` (+ algebraic SAN), `by`, and `outcome` ∈ {1, 0, 0.5, null} labelled **from the mover's perspective** (null = unfinished). Exportable as JSONL from the My Games page.
- Corpus is **client-side only** so far; no server ingestion, no model.

**Result:** None yet — this is the instrument. (Cf. EXP-001, which was also "build + baseline".)

**Interpretation / governance:**
- The corpus does **not** feed `chooseMove`, and must not until it clears a strength gate: any opening book or value adjustment derived from it has to beat baseline in self-play across ≥3 seeds before it ships at non-zero weight. New eval terms ship at weight 0 until proven.
- Honest framing of "train the AI": this delivers the *data prerequisite*. Naive online weight updates from a handful of games would more likely regress (EXP-002), so we stop at a clean, replay-validated, outcome-labelled corpus and a documented consumption path.

**Open questions:**
- O1. Opening book: does mining the first N plies of won games yield a first-move policy that beats the depth-2 tier? (Benchmark it.)
- O2. Value supervision: are `(position → outcome)` pairs dense enough at low game counts to fit anything beyond the existing material/officer terms, or is self-play still the only viable value source until the corpus is ~10³ games?
- O3. Selection bias: human games skew toward beginner blunders — does that *help* the lower tiers (target behaviour) and *hurt* if pooled into one book? Likely needs per-tier partitioning.
