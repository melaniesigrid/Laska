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

---

## EXP-003 — Do the §1/§2 positional eval terms earn their keep?
- **Date:** 2026-06-22 · **Thread:** A · **Run by:** `game-ai-engineer`
- **Question:** `edgeSafety` (w=4) + `overConcentration` (w=5) in `src/ai.ts` (from STRATEGY.md §1/§2) pass unit tests — but do they improve *play*?
- **Method:** A/B self-play, WITH (current weights) vs WITHOUT (those two zeroed), equal depth, colour-balanced, seeds 1/2/3. Per-term isolation too.
- **Result:** depth 4 → +1/−4/+0 (wash, net negative); depth 3 → +0/−10/−4 (terms HURT); stacking both is worse than either alone. Ladder stays monotonic; cost ≈ free (+0.7% nodes). **Verdict: terms don't earn their keep** (consistent with A3 — `DEFAULT_WEIGHTS` at a local optimum).
- **Verify:** typecheck clean; tests pass (57). No production change made.
- **Findings:** A5; B4 (unit tests insufficient as a strength gate); B3 reinforced (brief mis-stated commit state; agent verified the real tree before measuring).

## EXP-004 — Fix-and-prove the §1/§2 weights (DIED — process exit)
- **Date:** 2026-06-23 · **Thread:** A · **Run by:** `game-ai-engineer` (worktree-isolated, background) · **Status:** ⚠️ LOST
- **Mandate (CEO):** under gate D-001, find weights that beat baseline at both depths or zero them with evidence; land on branch `ai/exp004-positional-eval-weights`.
- **Outcome:** the background agent was killed by a parent-process exit before committing. No branch, no worktree survived (auto-pruned), no `DEFAULT_WEIGHTS` change reached the main tree (still 4/5). Its scratch A/B harness persisted (`scratchpad/ab-eval.ts`) and can re-derive the answer. See finding **B6**. To be re-run.

## Reconnaissance R-001 — the AI codebase has bifurcated (2026-06-23)
Read-only survey. Two AI codebases: **production** `src/ai.ts` (`chooseMove` + DIFFICULTY tiers + `evaluate`; the web AI worker imports it — what EXP-001→004 measured) and a **research layer** `src/agents/` (typed pluggable `random`/`greedy`/`search`-with-**quiescence**/`mcts`, a named `ROSTER`/`LADDER`, and `arena.ts` with `roundRobin`/`Standing`). No app/server code imports the research layer (grep-confirmed) — it's not wired in. Implications: duplicated arena (→ B5/D-002); the research `SearchAgent` has quiescence, the prime lever for **A2**; unresolved strategic fork (is `src/agents/` the future production engine?). → motivated EXP-005.

## EXP-005 — Does quiescence earn a production migration?
- **Date:** 2026-06-23 · **Thread:** A · **Run by:** `game-ai-engineer` (died on process exit); **recovered + run by main loop** from the surviving scratch harness `scratchpad/exp005.ts` (import paths re-absolutized).
- **Pre-registered bar:** quiescence-on beats quiescence-off head-to-head at equal depth across all 3 seeds AND materially cuts the ply-cap draw rate, at acceptable cost.
- **Method:** `createSearchAgent({quiescence})` A/B at equal depth, `blunderRate:0`, colour-balanced, seeds 1/2/3, 12 games/seed, via the canonical `src/agents/arena.ts` (per D-002). MAXPLIES=200. Modes: `ab4`, `ab6`, `cost`, `parity`, `ladder`.
- **Result — depth 4 (verbatim):** `q-on 23W / q-off 1W / 12D over 36 games`; ply-cap draws **2/36 = 6%**; avgPlies≈108. Per seed: 8/0/4, 7/1/4, 8/0/4 — **q-on never lost a seed.** Ladder smoke: monotonic, decisive (Viktor w/ quiescence: 0 draws).
- **Result — depth 6 / cost / parity:** ⏳ battery running in background at log time; APPEND verbatim when complete. (Parity wraps production `chooseMove` w/ a `quiescence` flag vs the research `SearchAgent` — tests whether migration is a one-line flag-flip.)
- **Key discovery:** production `chooseMove` already accepts a `quiescence` option (+ `qNodes` stats) — so quiescence is plumbed into the *production* engine, likely just not enabled in the DIFFICULTY tiers. Migration may be config, not code.
- **Verdict (interim):** quiescence is a **major** strength upgrade (not marginal) and directly attacks A2. Pending the parity/cost confirmation, recommend enabling it in production. Findings: A7; A2 (quiescence mitigates it).

## Findings ledger (running index)

| ID | Thread | Claim | Status |
|----|--------|-------|--------|
| A1 | game AI | depth-3→depth-4 buys ~no strength (eval-bound, not search-bound) | **REFUTED by EXP-002.** Depth conversion IS healthy (~63–67% best-play); apparent weakness is blunder-rate-bound (a product feature), not eval-bound. The EXP-001 signal was N=2 noise. |
| A2 | game AI | strong-tier games rarely terminate (capture buries, never removes) | observed, EXP-001; reinforced (high ply-cap draw rate dominates close games) |
| A3 | game AI | `DEFAULT_WEIGHTS` are at a local optimum for d3-vs-d4; perturbations flat or worse | observed, EXP-002 |
| A4 | game AI | the right lever for tier separation is blunder-rate / depth config, not eval weights | proposed, EXP-002 |
| B1 | methodology | charter constraints steer agent behavior without re-prompting | observed, EXP-001 & EXP-002 |
| B2 | methodology | resuming an agent on its own finding yields disciplined follow-through (incl. refuting itself) | observed, EXP-002 |
| B3 | methodology | concurrent multi-agent edits to one file cause transient red states; in-lane discipline contains them | observed, EXP-002; reinforced EXP-003 |
| A5 | game AI | §1/§2 terms (`edgeSafety`+`overConcentration`) don't add strength: wash at d4, negative at d3; cost ≈ free; stacking both worse than either alone | observed, EXP-003 |
| A6 | game AI | the AI codebase bifurcated: production `src/ai.ts` vs research layer `src/agents/` (quiescence+MCTS+arena), the latter NOT wired into the app | observed, recon R-001 |
| A7 | game AI | **QUIESCENCE is a major strength upgrade** — q-on beats q-off **23–1** at equal depth 4, ply-cap draws→6%; production `chooseMove` already accepts the flag (migration may be config-only) | observed, EXP-005 (d4); d6/cost/parity pending |
| B4 | methodology | unit tests are insufficient as a strength gate — a term can pass assertions yet be strength-neutral/negative in self-play; require an A/B (→ gate D-001) | observed, EXP-003 |
| B5 | methodology | the org duplicated benchmark infra (`bench-strength.ts` vs `src/agents/arena.ts`) — capability-level duplication, B3 at architecture scale; a shared capability index would prevent it | observed, recon R-001 |
| B6 | methodology | **background subagents lose ALL in-process work on parent-process exit** (EXP-004+005 both died, no branch/commit); recovery only via scratch-to-disk. Untracked shared docs also get clobbered by concurrent lost-updates (`NOTEBOOK.md` reverted to EXP-002 state). Durable record must live in git or memory; long runs must checkpoint early | observed, this session (2026-06-23) |

---

## Decisions log (governance — Sr-Eng/CEO calls, distinct from experiments)

### D-001 — Eval-term strength gate (2026-06-23)
A new evaluation term in `src/ai.ts` ships at **default weight 0** until `game-ai-engineer`'s self-play A/B proves it improves play (≥ baseline at every tier depth, strictly better where intended, ≥3 seeds) — passing a unit test is not enough (B4). Term *logic/idea* = STRATEGY workstream's lane; the *default weight that ships* = `game-ai-engineer`'s. Failed terms stay in code at weight 0 (dormant, evidence recorded), never silently deleted. Origin: EXP-003. Codified in `.claude/agents/game-ai-engineer.md` + `README.md`.

### D-002 — One arena; `src/agents/` is the canonical AI-research substrate (2026-06-23)
`src/agents/arena.ts` (typed, pluggable, quiescence+MCTS-capable) is the canonical self-play arena; `bench-strength.ts` is superseded (keep as the EXP-004 gate, then port its blunder-0 A/B + depth-isolation modes over and retire). New experiments build on `src/agents/`; agents must check `src/agents/index.ts` before building a new benchmark (B5). A technique proven in the research layer (e.g. quiescence, EXP-005) must be *planned into production `src/ai.ts`*, not left a silent fork. Open question to user: is `src/agents/` the intended future production engine? Origin: recon R-001 / B5.

### D-003 — Durability rules for background work (2026-06-23)
After B6 cost real work: (1) long background experiments must **checkpoint to a branch/disk early**, not only at the end; (2) the canonical research record lives in **git** (this file, now committed) — not as an untracked shared-tree file; (3) findings are mirrored to **memory** (uncontended) as a backstop; (4) scratch harnesses persist to the scratchpad so a crashed run is re-runnable.

---

## EXP-006 — Player-game corpus: a (state, action, return) substrate from saved games
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
