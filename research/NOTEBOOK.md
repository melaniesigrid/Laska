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
- **Date:** 2026-06-22 · **Thread:** A (+ B) · **Run by:** `game-ai-engineer` (resumed, context intact) · **Status:** COMPLETE
- **Hypothesis:** The near-tie in EXP-001 is an *evaluation* problem, not a search problem. Re-weighting eval terms in `src/ai.ts` (without changing search depth) will let the deeper tier convert its extra search into wins.
- **Pre-registered bar (set before running):** `medium` ≥ 65–70% head-to-head vs `intermediate` across ≥3 seeds at a solid N, AND the full ladder stays monotonic (beginner < easy < intermediate < medium) on every seed.
- **Method:** BEFORE multi-seed baseline (`--seed 1/2/3`, N=10 = 20 games/pairing) → offline weight sweep (scratch, seeded `makeRng`, colour-balanced) → the decisive test: isolate *pure depth conversion* with `blunderRate:0` → AFTER battery on the same seeds. Guardrails held: engine untouched, weights ultimately unchanged, determinism preserved, ladder ends re-checked.

**Result (verbatim):**
- **BEFORE (seeds 1/2/3, N=10):** medium won standings decisively (82–83%) and never lost the head-to-head (≈11:2, 9:3, 12:3 win:loss), but a **high ply-cap draw rate (5–8 / 20)** held its head-to-head *win %* to ~45–60% — under the 65% bar. Ladder monotonic. → The EXP-001 "coin-flip" was **small-sample (N=2) noise**; the real phenomenon is **draws, not inversion.**
- **Decisive test — pure depth conversion, `blunderRate:0`, current weights:** depth-4 beats depth-3 **~57–77% across dispersed seeds (avg ~63–67%)** — already healthy. Perturbing weights was flat (`enemyPrisoner 18→28`: identical 63%) or *worse* (`advance 6→10`: depth-4 win% fell to 35%; `mobility→0`: draws ballooned to 57%). **`DEFAULT_WEIGHTS` sit at a local optimum for this matchup.**
- **AFTER (live eval, seeds 1/2/3, N=10):** medium standings 72–73%, intermediate 55–60%, easy 33–35%, beginner 0–2%; **ladder monotonic on all three seeds**; medium never lost the head-to-head (11:2, 9:3, 10:3).

**Outcome: hypothesis REFUTED.** The depth-3→depth-4 step *does* convert to wins in best play; it only *looked* weak because the **intentional product blunder rates** (intermediate 12%, medium 6%) inject randomness that decides close games — a deliberate "keep lower tiers beatable" feature, not an eval bug. Tuning weights to chase a higher blunder-on win % measurably *degrades* real strength (shown above). **No weight change made.** Instead added a non-flaky regression guard (`test/ai.test.ts:306`, "STRENGTH GUARD: depth-4 best-play stays competitive with depth-3 across dispersed seeds") asserting only the robust property (deeper search never *dominated*), because a strict "deep > shallow" assertion is itself flaky — seed pockets exist (e.g. base 1000) where depth-3 edges depth-4.
- **Recommendation:** if the product wants a *larger visible* intermediate↔medium gap, the lever is `DIFFICULTY_BLUNDER` / `DIFFICULTY_DEPTH` (tier config), **not** eval weights. The harness can now measure any such change.

**Independent verification (main loop):** `npm run typecheck` clean; `npm test` 53/53 pass (the strength-guard test present at `test/ai.test.ts:306`).

**Meta-finding (B):**
- **B2 — Resuming an agent on its *own* finding produced exemplary discipline:** it ran a pre-registered battery, *refuted its own hypothesis*, and **declined to make an unjustified change** — arguably a stronger charter-steering demonstration than EXP-001 (resisting the pull to "do the task" when the data says don't).
- **B3 — Concurrent multi-agent edits to one file caused a transient correctness gap.** While this agent worked, `src/ai.ts` was concurrently rewritten (+289 lines: `edgeSafety`/`overConcentration` per `STRATEGY.md` §1/§2) by other activity in the repo; the agent observed **2 failing tests** from that work, correctly **stayed in its lane** (didn't fix another engineer's code), and flagged it. By the time the main loop verified, the §1/§2 owner had fixed those tests (53/53 green). Lesson: same-file fan-out needs ownership/serialization or it produces transient red states that confuse concurrent runs.
  - **Resolution (adopted 2026-06-22):** parallelism is the operating model (the user + other agents work continuously, and agents can open their own branches/PRs). Rather than serialize, we **isolate**: every subagent charter now mandates *branch + PR, never `main`*, worktree isolation for hot-spots like `src/ai.ts`, rebase-before-verify, and "a red test you didn't cause is someone else's in-flight work — flag, don't fix." Codified in all 8 `.claude/agents/*.md` and the agents `README.md`. This converts B3 from a hazard into a controlled merge process — and makes future EXP results attributable to a specific branch/PR rather than a shared mutable working tree.

---

## EXP-003 — Do `edgeSafety` & `overConcentration` (STRATEGY §1/§2) actually add strength?
- **Date:** 2026-06-22 · **Thread:** A (+ B) · **Run by:** `game-ai-engineer` · **Repo:** `dea3cfb` (working tree; `src/ai.ts` sha `c44c880`)
- **Motivation:** Two positional eval terms (`edgeSafety` §1, `overConcentration` §2) were added to `evaluate`. They pass unit tests, but unit assertions only prove the term *fires*, not that it *helps play*. Question: do they improve playing strength, or just satisfy assertions (or hurt)?
- **Repo-state note (important):** Contrary to the task's framing, both terms were already **committed in HEAD** (`dea3cfb`), present and active in `DEFAULT_WEIGHTS` (`edgeSafety:4`, `overConcentration:5`). The *uncommitted* working-tree diff on `src/ai.ts` was a **different in-flight edit by another agent** — threading a `rules: RuleOptions` variant through `SearchConfig`/`negamax`/`resolveConfig` (move-generation plumbing, **not** eval math). Per charter (a change I didn't cause is someone else's lane) I left it untouched; it doesn't confound the A/B because both WITH/WITHOUT configs run on the identical tree and it never touches `evaluate`. Measured tree was green at start (typecheck clean, 57/57 tests).

**Hypothesis (the terms' implicit claim):** Activating `edgeSafety`+`overConcentration` (WITH) beats the same eval with both zeroed (WITHOUT), head-to-head at equal depth.

**Pre-registered bar (set before running):**
1. **Strength:** WITH beats WITHOUT head-to-head at equal depth by a *meaningful, consistent* margin — **positive win-margin on all 3 seeds (1/2/3)** and net ≥ +55% adjusted score. A wash (±1 game/seed, no consistent sign) or any negative ⇒ terms don't earn their keep.
2. **Ladder:** with terms active (production), beginner < easy < intermediate < medium stays monotonic (no inversions).
3. **Cost:** nodes/move essentially unchanged vs the ~1,823 baseline; ms/move within +15% of ~58 ms. (Terms are scalar per-node arithmetic with no extra node generation, so the expectation is ~zero cost.)

**Method:** A/B self-play mirroring EXP-002 / `bench-strength.ts` — colour-balanced, deterministic seeded `makeRng`, `chooseMove({ depth, weights, blunderRate:0 })`, ply-cap 100 + wall-clock guard. The clean test is **equal depth both sides**, so any margin is the *weights'* contribution, not search. WITH = current `DEFAULT_WEIGHTS`; WITHOUT = identical but `edgeSafety:0, overConcentration:0`; plus per-term isolation (each term alone vs WITHOUT). N=24 games/pairing (12/colour), seeds 1/2/3, `blunderRate:0` (best play = cleanest signal). Reusable scratch harness `scratchpad/ab-weights.ts` + cost harness `ab-cost.ts` (depth-8, first 12 plies, JIT-warmed `scoreMoves`+`SearchStats`, alternated order). **No tracked file edited; `DEFAULT_WEIGHTS` left exactly as found.**

**Result (verbatim, A = first-named config, adjusted score win=1/draw=0.5):**
- **WITH vs WITHOUT, depth 4 (medium), seeds 1/2/3:** A-score **52% (margin +1)**, **42% (−4)**, **50% (+0)**. Draw-heavy (14–15/24). → wash, net **negative**. **Bar 1 FAILED** (not positive on all seeds).
- **WITH vs WITHOUT, depth 3 (intermediate), seeds 1/2/3:** **50% (+0)**, **29% (−10)**, **42% (−4)**. → WITHOUT **clearly stronger**; the terms **hurt** at depth 3.
- **Per-term @ depth 4 (seeds 1/2/3):**
  - `edgeSafety`-only vs WITHOUT: 54% (+2), 42% (−4), 52% (+1) → marginally +, still flips negative on seed 2.
  - `overConcentration`-only vs WITHOUT: 56% (+3), 44% (−3), 56% (+3) → marginally +, flips negative on seed 2.
  - **Interaction note:** each term *alone* is ≈break-even-to-slightly-positive, but **WITH (both stacked) is worse than either alone** (+1/−4/+0 vs the per-term +2/−4/+1 and +3/−3/+3). The two terms appear to *compound unfavourably* — both shade the same tall-column structure (§1 "hug the edge", §2 "don't overstuff"), and together they distort play more than they help.
- **Ladder (terms active, seed 1, N=8/colour, 96 games):** beginner 2% · easy 33% · intermediate 54% · medium 73%; **monotonic, 0 inversions. Bar 2 PASSED.**
- **Cost (depth 8, first 12 plies, warmed):** WITHOUT **1,823 nodes/move** (~22–23 ms) vs WITH **1,836 nodes/move** (~22–27 ms). nodes +0.7% (line diverges because the terms change the *chosen* move, not from per-node work); ms within noise. **Bar 3 PASSED — the terms are essentially free.**

**Outcome: hypothesis REFUTED / terms do NOT earn their keep on strength.** Across both real play depths (3 and 4) and all three seeds, WITH never beats WITHOUT by a consistent margin; at depth 3 WITHOUT is clearly stronger (−10 on seed 2). The terms are *cheap* (≈zero node/time cost) and don't break the product ladder, but "cheap and strength-neutral-to-slightly-negative" is not a strength improvement — they currently **pass their unit tests without improving (and at d3, while degrading) play.** This is consistent with **A3** (`DEFAULT_WEIGHTS` sit at a local optimum; perturbations are flat or worse) — adding these two terms is exactly such a perturbation, and it lands flat-to-negative.

**Recommendation (to the §1/§2 STRATEGY owner — NOT this agent's lane to fix):** the terms as weighted (`edgeSafety:4`, `overConcentration:5`) don't pay for themselves. Options: (a) zero them (revert to material/mobility/column eval, which is at least as strong); (b) keep only one term — `overConcentration`-only was the least-bad and the combination is worse than either alone, so **stacking both is the main offender**; (c) re-weight far smaller and re-A/B against this harness before shipping. Any of these is a positional-term decision (their lane). The harness (`scratchpad/ab-weights.ts`) is the gate to re-run any re-weight through. **No production weight change made by this experiment.**

**Independent verification:** `src/ai.ts` sha unchanged end-to-end (`c44c880`); `npm run typecheck` clean; `npm test` **57/57** pass. (Higher than EXP-002's 53 — the §1/§2 terms and others added tests since.)

**Meta (B):**
- **B4 — Unit tests proved insufficient as a strength gate.** Both terms passed their `test/ai.test.ts` assertions yet are strength-neutral-to-negative in self-play. A "term fires correctly" unit test and a "term improves play" A/B are different claims; the project should require the latter (run this harness) before a positional term ships. This is the EXP-003 headline for Thread B: assertions can launder a non-improvement.
- **B3 reinforced:** the task brief asserted the terms were *uncommitted working-tree* changes; in fact they were committed and the working-tree diff was an *unrelated* concurrent edit. The agent reconciled the discrepancy from `git` before measuring rather than trusting the brief — the same "verify the actual tree, flag the mismatch, stay in lane" discipline B3 codified.

---

## Findings ledger (running index)

| ID | Thread | Claim | Status |
|----|--------|-------|--------|
| A1 | game AI | depth-3→depth-4 buys ~no strength (eval-bound, not search-bound) | **REFUTED by EXP-002.** Depth conversion IS healthy (~63–67% best-play); apparent weakness is blunder-rate-bound (a product feature), not eval-bound. The EXP-001 signal was N=2 noise. |
| A2 | game AI | strong-tier games rarely terminate (capture buries, never removes) | observed, EXP-001; reinforced (high ply-cap draw rate dominates close games) |
| A3 | game AI | `DEFAULT_WEIGHTS` are at a local optimum for d3-vs-d4; perturbations flat or worse | observed, EXP-002 |
| A4 | game AI | the right lever for tier separation is blunder-rate / depth config, not eval weights | proposed, EXP-002 |
| B1 | methodology | charter constraints steer agent behavior without re-prompting | observed, EXP-001 & EXP-002 |
| B2 | methodology | resuming an agent on its own finding yields disciplined follow-through (incl. refuting itself) | observed, EXP-002 |
| B3 | methodology | concurrent multi-agent edits to one file cause transient red states; in-lane discipline contains them | observed, EXP-002; reinforced EXP-003 (brief mis-stated commit state; agent verified the real tree before measuring) |
| A5 | game AI | `edgeSafety`+`overConcentration` (§1/§2) don't add strength: WITH ≈ WITHOUT at d4 (wash, net −), WITHOUT clearly stronger at d3; cost ≈ free; ladder still monotonic | observed, EXP-003 — terms don't earn their keep; stacking both is worse than either alone (consistent with A3) |
| B4 | methodology | unit tests are insufficient as a strength gate — a term can pass assertions yet be strength-neutral/negative in self-play; require an A/B before shipping a positional term | observed, EXP-003 |
| A6 | game AI | a parallel research layer `src/agents/` exists (random/greedy/search-with-quiescence/MCTS + named ROSTER/LADDER + typed `arena.ts`), **not yet wired into the app**; production still runs `src/ai.ts chooseMove`. Quiescence + deeper search are strength levers the production AI lacks. | observed, recon R-001 |
| B5 | methodology | the org **duplicated benchmark infrastructure**: `game-ai-engineer` built `bench-strength.ts` while a parallel workstream built `src/agents/arena.ts`, independently, for the same purpose. Architecture-scale analogue of B3 (same *capability*, not just same file). Lesson: a shared capability index (e.g. `src/agents/index.ts`) that agents must check before building would have prevented it. | observed, recon R-001 |

---

## Reconnaissance R-001 — the AI codebase has bifurcated (2026-06-23)
Read-only survey while EXP-004 ran. The repo now has **two AI codebases**:
- **Production:** `src/ai.ts` (`chooseMove` + DIFFICULTY tiers + `evaluate`, incl. the §1/§2 terms). The web AI worker (`web/src/ai/aiWorker.ts`) imports this. Everything EXP-001→004 measured/tuned. ✓ live.
- **Research layer:** `src/agents/` — typed, pluggable: `random`/`greedy`/`search` (with **quiescence**, depths 6 & 10)/`mcts`, a named `ROSTER`/`LADDER` (Cadet→Pip→Margot→Viktor→Dr.Lasker, + wildcard Monte=MCTS), and `arena.ts` (`playGame`/`playMatch`/`roundRobin`/`Standing`). **No app/server code imports it** (`grep` confirms). Built by the overnight workstream.

Implications: (1) duplicated arena → see B5 / decision D-002. (2) the research `SearchAgent` has **quiescence**, which directly targets **A2** (best-play games not terminating / tactical instability) — a concrete strength lever the production negamax lacks. (3) strategic fork: is `src/agents/` meant to *become* production, or stay a sandbox? Unresolved — escalated to the user.

---

## Decisions log (governance — Sr-Eng/CEO calls, distinct from experiments)

### D-001 — Eval-term strength gate (2026-06-23)
- **Context:** EXP-003 (finding A5/B4) showed two shipped eval terms passing unit tests while *weakening* the intermediate tier. Surfaced an ownership overlap: the STRATEGY workstream adds eval-term *logic* to `src/ai.ts`; `game-ai-engineer` owns eval *weight tuning* in the same file.
- **Decision (CEO):** A new evaluation term ships at **default weight 0** until `game-ai-engineer`'s self-play A/B proves it improves play (≥ baseline at every tier depth, strictly better where it's meant to help, ≥3 seeds). Term *logic/idea* = STRATEGY's lane; *default weight that ships* = `game-ai-engineer`'s lane. Failed terms stay in code at weight 0 (dormant, evidence recorded), never silently deleted.
- **Codified in:** `.claude/agents/game-ai-engineer.md` ("The strength gate"), `.claude/agents/README.md` ("Cross-org decisions").
- **Acted on by → EXP-004:** rather than leave the §1/§2 terms flagged, ran fix-and-prove: search for weights that clear the gate; adopt if found, else zero with evidence. (Worktree-isolated, branch `ai/exp004-positional-eval-weights`, result pending.)

### D-002 — One arena; `src/agents/` is the canonical AI-research substrate (2026-06-23)
- **Context (recon R-001):** a parallel workstream built `src/agents/` — a typed, pluggable AI-research layer whose `arena.ts` (`roundRobin`/`Standing`) duplicates `bench-strength.ts`'s self-play arena and is strictly more general (arbitrary agents, depths, blunder rates, quiescence, MCTS). The app does not import it yet; production AI remains `src/ai.ts chooseMove`.
- **Decision (CEO):** `src/agents/arena.ts` is the **canonical** self-play arena going forward. `bench-strength.ts` is **superseded** — keep it only as the EXP-004 gate until that lands, then port its unique modes (blunder-rate-0 best-play A/B, depth-conversion isolation) into the agents arena and retire it. New experiments build on `src/agents/`. A technique proven in the research layer (e.g. quiescence) must be *planned into production `src/ai.ts`*, not left as a silent parallel fork.
- **Codified in:** `game-ai-engineer.md` ("Two AI substrates"), `README.md` ("Cross-org decisions"). Escalated to user: confirm whether `src/agents/` is the intended future production engine.
- **Next experiment teed up → EXP-005:** arena the production negamax vs the research `SearchAgent`-with-quiescence at equal depth across seeds; if quiescence wins, it's the adopt-into-production path and resolves A2. Not launched yet (would collide with EXP-004's `src/ai.ts` edit).

---

## EXP-006 — Player-game corpus: a (state, action, return) substrate from saved games
- **Date:** 2026-06-23 · **Thread:** A (data substrate) · **Run by:** main loop (saved-games feature) · **Repo:** untracked working tree
- **Motivation:** All strength work so far (EXP-001…003) is *self-play* against the engine's own heuristic. There was no corpus of *played* games — human-vs-AI or hotseat — to mine for openings, blunders, or value targets. The new "save & rewatch" feature records every local game; this entry documents the pipeline that turns that history into training data, and what it is **not** yet allowed to do.

**Hypothesis (to be tested later):** Real played games contain signal self-play doesn't — human opening preferences and recurring losing patterns — usable for (a) an opening book and (b) value-target supervision, without retuning the negamax weights (which EXP-002 found at a local optimum).

**Method (build, not yet a result):**
- `web/src/savedGames.ts` — saved games store *only* moves (`from/to/captures` + per-ply notes), never board snapshots; positions are reconstructed by replaying through the **real engine** (`rebuildGame`), exactly as `games.ts` validates Lasker's games. A move that won't replay throws — the save is corrupt or the ruleset drifted, surfaced, never papered over.
- `web/src/training.ts` — `buildTrainingCorpus(games)` emits one sample per ply: `position` = engine canonical string (`encodePosition`, the repetition key) of the state *before* the move, `move` (+ algebraic SAN), `by`, and `outcome` ∈ {1, 0, 0.5, null} labelled **from the mover's perspective** (null = unfinished). Exportable as JSONL from the My Games page.
- Corpus is **client-side only** so far; no server ingestion, no model.

**Result:** None yet — this is the instrument. (Cf. EXP-001, which was also "build + baseline".)

**Interpretation / governance (per D-002 — one arena, no silent parallel fork):**
- The corpus does **not** feed `chooseMove`, and must not until it clears a strength gate (D-001): any opening book or value adjustment derived from it has to beat baseline in `src/agents/arena.ts` across ≥3 seeds before it ships at non-zero weight.
- Honest framing of "train the AI": this delivers the *data prerequisite*. Naive online weight updates from a handful of games would more likely regress (EXP-002), so we stop at a clean, replay-validated, outcome-labelled corpus and a documented consumption path.

**Open questions:**
- O1. Opening book: does mining the first N plies of won games yield a first-move policy that beats the depth-2 tier? (arena it.)
- O2. Value supervision: are `(position → outcome)` pairs dense enough at low game counts to fit anything beyond the existing material/officer terms, or is self-play still the only viable value source until the corpus is ~10³ games?
- O3. Selection bias: human games skew toward beginner blunders — does that *help* the lower tiers (target behaviour) and *hurt* if pooled into one book? Likely needs per-tier partitioning.
