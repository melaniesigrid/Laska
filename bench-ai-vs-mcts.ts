/**
 * CROSS-FAMILY strength benchmark — pits the PRODUCTION AI (`chooseMove` /
 * negamax + alpha-beta, via its `DIFFICULTY_DEPTH` tiers) against the independent
 * Monte Carlo Tree Search agent (`createMctsAgent`, the UCT family in
 * `src/agents/`).
 *
 * WHY THIS BENCHMARK EXISTS (and how it differs from the others):
 *  - `bench-baseline.ts` measures search SPEED (nodes/s) only.
 *  - `bench-strength.ts` measures the production tiers against EACH OTHER
 *    (self-play) — same algorithm family, so it cannot catch a regression that
 *    drags the whole family down together.
 *  - THIS script measures the production negamax against a genuinely DIFFERENT
 *    algorithm. There is no third-party reference Laska engine available, so MCTS
 *    is the closest thing to an external yardstick: a separate move-selection
 *    method, with its own failure modes, that does not share the production
 *    eval's blind spots beyond the static `evaluate` it uses at the rollout
 *    horizon. If a heuristic change makes negamax beat MCTS by less, that is a
 *    cross-family strength signal the self-play matrix can miss.
 *
 * Determinism: every game is driven by the same seeded mulberry32 RNG
 * (`makeRng`) that the arena and tests use, threaded into BOTH players (the
 * production AI's blunder roll + tie-break, and MCTS's expansion + rollouts), so
 * a given (pairing, seed) is bit-for-bit reproducible. (See the determinism
 * guardrail at the top of `bench-strength.ts`.)
 *
 * Colour fairness: we reuse the arena's `playMatch`, which alternates which side
 * plays White each game, so White's first-move advantage cancels out of every
 * head-to-head. Each game also gets a distinct derived seed, so the match is
 * varied yet reproducible.
 *
 * Termination: the arena's `maxPlies` cap (default here below the engine's
 * no-progress draw rule) plus the engine's own `gameStatus` draw rules ensure no
 * game can hang the run.
 *
 * HONEST NOTE ON STRENGTH (measured 2026-06): the production negamax is NOT a
 * blanket favourite over MCTS. At shallow tiers / low MCTS budgets it is roughly
 * at parity, and a HIGHER-budget MCTS (~200 iterations) actually beat depth-4
 * `medium` head-to-head on the benchmark seeds. The clear production wins are at
 * `medium`+ vs LOW-budget MCTS and at `hard` (depth 6 + quiescence) vs all
 * budgets tried. The regression guard in the test suite is pinned to that
 * reliably-true region, not to an inflated claim.
 *
 * Usage (all flags optional):
 *   node bench-ai-vs-mcts.ts                          # default tiers vs default MCTS budgets
 *   node bench-ai-vs-mcts.ts --games 8               # games per pairing (colours alternate)
 *   node bench-ai-vs-mcts.ts --tiers medium,hard     # which production tiers to test
 *   node bench-ai-vs-mcts.ts --budgets 80,200        # MCTS iteration budgets to test
 *   node bench-ai-vs-mcts.ts --seed 7 --cap 160      # base seed + per-game ply cap
 *   node bench-ai-vs-mcts.ts --blunder               # let tiers use their default blunder rate
 */
import { chooseMove } from './src/index.ts';
import { DIFFICULTY_ORDER, DIFFICULTY_DEPTH, type Difficulty } from './src/index.ts';
import type { GameState, Move } from './src/types.ts';
import type { Agent, AgentContext } from './src/agents/index.ts';
import { createMctsAgent, playMatch } from './src/agents/index.ts';

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const GAMES = Number(arg('games') ?? 8);
const BASE_SEED = Number(arg('seed') ?? 7);
const PLY_CAP = Number(arg('cap') ?? 160);
const USE_BLUNDER = has('blunder');

let tiers: Difficulty[];
const tierArg = arg('tiers');
if (tierArg) {
  tiers = tierArg.split(',').map((s) => s.trim()) as Difficulty[];
  for (const t of tiers) {
    if (!DIFFICULTY_ORDER.includes(t)) throw new Error(`unknown tier "${t}"`);
  }
} else {
  // Default: skip 'beginner'/'easy' (too weak to be an interesting cross-family
  // comparison) and 'expert' (depth 8 — slow). Ordered weakest -> strongest.
  tiers = ['intermediate', 'medium', 'hard'];
}

const budgets = (arg('budgets') ?? '80,200').split(',').map((s) => Number(s.trim()));

// --------------------------------------------------------------------------
// Wrap the PRODUCTION AI as an Agent so it plugs into the existing arena.
// This is a thin adapter — the search itself is unchanged `chooseMove`.
// --------------------------------------------------------------------------

/**
 * Adapt the production `chooseMove` (a free function keyed by difficulty) to the
 * research `Agent` interface, so it can be pitted against MCTS in the arena. By
 * default `blunderRate` is forced to 0 so we measure the tier's BEST play (the
 * blunder roll exists only to make the shipped tiers beatable by humans, and
 * would just add noise to a strength benchmark); pass `--blunder` to keep each
 * tier's default blunder rate instead.
 */
function productionTierAgent(tier: Difficulty): Agent {
  return {
    id: `prod-${tier}`,
    name: `Prod(${tier}, d${DIFFICULTY_DEPTH[tier]})`,
    blurb: `production negamax + alpha-beta at the "${tier}" tier`,
    family: 'search',
    chooseMove(state: GameState, ctx?: AgentContext): Move | null {
      return chooseMove(state, {
        difficulty: tier,
        random: ctx?.random ?? Math.random,
        ...(USE_BLUNDER ? {} : { blunderRate: 0 }),
      });
    },
  };
}

// --------------------------------------------------------------------------
// Run the matrix
// --------------------------------------------------------------------------

console.log('=== Laska CROSS-FAMILY strength benchmark: production negamax vs MCTS ===');
console.log(
  `tiers: ${tiers.map((t) => `${t}(d${DIFFICULTY_DEPTH[t]})`).join(', ')}  |  ` +
    `MCTS budgets: ${budgets.map((b) => `${b} iters`).join(', ')}`,
);
console.log(
  `${GAMES} games/pairing (colours alternate), ply cap ${PLY_CAP}, seed ${BASE_SEED}` +
    `${USE_BLUNDER ? ', tiers use default blunder rate' : ', best-play (blunder off)'}`,
);
console.log('Cell = production W-D-L vs that MCTS budget (production point of view).\n');

interface Cell {
  tier: Difficulty;
  budget: number;
  prodWins: number;
  mctsWins: number;
  draws: number;
}

const cells: Cell[] = [];
const runStart = process.hrtime.bigint();

for (const tier of tiers) {
  const prod = productionTierAgent(tier);
  for (const budget of budgets) {
    const mcts = createMctsAgent({
      id: `mcts-${budget}`,
      name: `MCTS(${budget})`,
      iterations: budget,
    });
    // A distinct, reproducible base seed per (tier, budget) pairing.
    const seed = BASE_SEED + DIFFICULTY_ORDER.indexOf(tier) * 1009 + budget;
    const t0 = process.hrtime.bigint();
    const m = playMatch(prod, mcts, { games: GAMES, seed, maxPlies: PLY_CAP });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    cells.push({ tier, budget, prodWins: m.aWins, mctsWins: m.bWins, draws: m.draws });
    const pct = ((m.aWins / m.games) * 100).toFixed(0);
    console.log(
      `${prod.name.padEnd(22)} vs ${mcts.name.padEnd(11)}  ` +
        `${String(m.aWins).padStart(2)}W ${String(m.draws).padStart(2)}D ${String(m.bWins).padStart(2)}L  ` +
        `(prod win% ${pct.padStart(3)}%)  ${(ms / m.games).toFixed(0)} ms/game`,
    );
  }
}

const runMs = Number(process.hrtime.bigint() - runStart) / 1e6;

// --------------------------------------------------------------------------
// Matrix + verdict
// --------------------------------------------------------------------------

const W = 13;
console.log('\n=== Production win-margin vs MCTS (row tier, column MCTS budget; +N = prod won by N games) ===');
process.stdout.write('tier'.padEnd(16));
for (const b of budgets) process.stdout.write(`mcts${b}`.padStart(W));
process.stdout.write('\n');
for (const tier of tiers) {
  process.stdout.write(`${tier}(d${DIFFICULTY_DEPTH[tier]})`.padEnd(16));
  for (const b of budgets) {
    const c = cells.find((x) => x.tier === tier && x.budget === b)!;
    const diff = c.prodWins - c.mctsWins;
    process.stdout.write(`${diff >= 0 ? '+' : ''}${diff}(${c.draws})`.padStart(W));
  }
  process.stdout.write('\n');
}

console.log('\n=== Verdict (cross-family) ===');
let beatsAll = 0;
let losesAny = 0;
for (const c of cells) {
  if (c.prodWins > c.mctsWins) beatsAll++;
  if (c.mctsWins > c.prodWins) {
    losesAny++;
    console.log(
      `  ⚠ ${c.tier}(d${DIFFICULTY_DEPTH[c.tier]}) LOST its match to MCTS(${c.budget}) ` +
        `${c.prodWins}-${c.mctsWins} — MCTS is the stronger family here.`,
    );
  }
}
if (losesAny === 0) {
  console.log('  Production negamax won (or tied) every cross-family match in this run.');
} else {
  console.log(
    `  Production won ${beatsAll}/${cells.length} cells; lost ${losesAny}. ` +
      `This is expected at higher MCTS budgets — see the honest note in the header.`,
  );
}

console.log(
  `\n${cells.length} pairings, ${cells.length * GAMES} games, finished in ${(runMs / 1000).toFixed(1)}s.`,
);
