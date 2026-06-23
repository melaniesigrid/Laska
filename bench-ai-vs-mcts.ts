/**
 * CROSS-FAMILY strength benchmark — the production negamax AI (`chooseMove` +
 * the DIFFICULTY tiers from `src/ai.ts`) vs. the research layer's MCTS/UCT agent
 * (`createMctsAgent` from `src/agents/`). It prints a win/loss/draw matrix of
 * each production tier against one or more MCTS budgets.
 *
 * WHY THIS EXISTS (TODO.md): "AI strength is not benchmarked against a reference
 * Laska engine." No third-party Laska engine exists, but the MCTS agent is a
 * genuinely DIFFERENT algorithm family (Monte-Carlo tree search vs. alpha-beta),
 * so it is the best available independent stand-in. Beating a different family is
 * a far stronger signal than self-play between depth tiers (which share an eval
 * and can collude on the same blind spots). This complements, and does not
 * duplicate, the existing benchmarks:
 *   - bench-baseline.ts  — search SPEED (nodes/time per depth).
 *   - bench-strength.ts  — self-play STRENGTH between production tiers.
 *   - src/agents/arena.ts (roundRobin) — agent-vs-agent within the research layer.
 * This is the only one that pits PRODUCTION `chooseMove` against the MCTS family.
 *
 * Determinism & colour fairness (same conventions as bench-strength.ts): every
 * game is driven by ONE seeded mulberry32 RNG (`makeRng`) shared by both sides —
 * `chooseMove` consumes it for tie-breaks (blunders are disabled here for a clean
 * best-play measurement) and the MCTS agent consumes it for expansion/rollouts —
 * so a given (tier, mcts-budget, colour, seed) reproduces an identical game. Each
 * pairing is colour-balanced: the tier plays an even split as White and as Black,
 * cancelling White's first-move advantage out of the head-to-head.
 *
 * Termination: Laska captures only BURY pieces (nothing leaves the board), so two
 * strong players can shuffle a long time. We rely on the engine's own draw rules
 * via `gameStatus`, plus a hard ply cap (draw fallback) and a per-game wall-clock
 * guard, so no game can hang the run.
 *
 * HONEST CAVEAT (measured, see the PR): vanilla MCTS with random rollouts is weak
 * at LOW iteration budgets — the production AI dominates a 20-40 iteration MCTS.
 * But MCTS strength scales with its budget, and at a HIGH budget (a few hundred+
 * iterations) it starts to out-result the production negamax in these games. The
 * matrix makes that crossover visible rather than hiding it.
 *
 * Usage (all flags optional):
 *   node bench-ai-vs-mcts.ts                          # smoke: a couple tiers vs a couple budgets
 *   node bench-ai-vs-mcts.ts --games 4               # 4 games/colour (8 per pairing)
 *   node bench-ai-vs-mcts.ts --tiers medium,hard
 *   node bench-ai-vs-mcts.ts --iters 40,120,400      # MCTS iteration budgets to test
 *   node bench-ai-vs-mcts.ts --cap 100 --seed 4242   # ply cap + base seed
 *   node bench-ai-vs-mcts.ts --rollout 24 --budget 8000
 */
import { createInitialState, applyMove, gameStatus, chooseMove } from './src/index.ts';
import { DIFFICULTY_ORDER, DIFFICULTY_DEPTH, type Difficulty } from './src/index.ts';
import { newStats, type SearchStats } from './src/ai.ts';
import { createMctsAgent, makeRng } from './src/agents/index.ts';
import type { GameState } from './src/types.ts';

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const GAMES_PER_COLOUR = Number(arg('games') ?? 2);
const PLY_CAP = Number(arg('cap') ?? 100);
const BASE_SEED = Number(arg('seed') ?? 4242);
/** MCTS rollout horizon (plies) before the static eval decides the rollout. */
const ROLLOUT_CAP = Number(arg('rollout') ?? 24);
/** Per-game wall-clock guard (ms): a game past this is recorded as a draw. */
const GAME_TIME_BUDGET_MS = Number(arg('budget') ?? 12000);

let tiers: Difficulty[];
const tierArg = arg('tiers');
if (tierArg) {
  tiers = tierArg.split(',').map((s) => s.trim()) as Difficulty[];
  for (const t of tiers) {
    if (!DIFFICULTY_ORDER.includes(t)) throw new Error(`unknown tier "${t}"`);
  }
} else {
  // Default smoke run: a mid and a strong tier. 'expert' (depth 8) is omitted to
  // keep the smoke run quick; pass --tiers to include it.
  tiers = ['medium', 'hard'];
}

const iterArg = arg('iters');
const MCTS_BUDGETS = (iterArg ? iterArg.split(',').map((s) => Number(s.trim())) : [40, 200]).filter(
  (n) => Number.isFinite(n) && n > 0,
);

// --------------------------------------------------------------------------
// One game: production tier vs one MCTS budget
// --------------------------------------------------------------------------

type GameEnd = 'ai' | 'mcts' | 'draw';

interface GameResult {
  end: GameEnd;
  plies: number;
  reason: string;
  /** Production-AI search nodes summed across this game's AI moves. */
  nodes: number;
  ms: number;
}

/**
 * Play one game between a production difficulty `tier` and an MCTS agent built
 * for `iterations`. `aiIsWhite` sets which colour the production AI plays. One
 * seeded RNG drives both sides, so the game is fully reproducible.
 */
function playGame(tier: Difficulty, iterations: number, aiIsWhite: boolean, seed: number): GameResult {
  const mcts = createMctsAgent({ iterations, rolloutCap: ROLLOUT_CAP });
  let state: GameState = createInitialState();
  const rng = makeRng(seed);
  const stats: SearchStats = newStats();
  const t0 = process.hrtime.bigint();
  let plies = 0;

  for (; plies < PLY_CAP; plies++) {
    const status = gameStatus(state);
    if (status.state === 'win') {
      // The side to move has lost; the recorded winner wins.
      const winnerIsWhite = status.winner === 'W';
      return finish(winnerIsWhite === aiIsWhite ? 'ai' : 'mcts', status.reason);
    }
    if (status.state === 'draw') return finish('draw', status.reason);

    if (Number(process.hrtime.bigint() - t0) / 1e6 > GAME_TIME_BUDGET_MS) {
      return finish('draw', 'time-budget');
    }

    const aiToMove = (state.toMove === 'W') === aiIsWhite;
    const move = aiToMove
      ? // Best play: blunderRate 0 so we measure the tier's true strength.
        chooseMove(state, { difficulty: tier, blunderRate: 0, random: rng, stats })
      : mcts.chooseMove(state, { random: rng });

    if (!move) {
      // No legal move = the side to move loses (defensive; gameStatus catches it).
      const sideToMoveIsWhite = state.toMove === 'W';
      return finish(sideToMoveIsWhite === aiIsWhite ? 'mcts' : 'ai', 'no-moves');
    }
    state = applyMove(state, move);
  }
  return finish('draw', 'ply-cap');

  function finish(end: GameEnd, reason: string): GameResult {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { end, plies, reason, nodes: stats.nodes, ms };
  }
}

// --------------------------------------------------------------------------
// One pairing (colour-balanced)
// --------------------------------------------------------------------------

interface PairResult {
  tier: Difficulty;
  iterations: number;
  aiWins: number;
  mctsWins: number;
  draws: number;
  games: number;
  nodes: number;
  ms: number;
  reasons: Record<string, number>;
}

/**
 * Play `tier` vs MCTS(`iterations`) with colours balanced: GAMES_PER_COLOUR
 * games with the AI as White, then GAMES_PER_COLOUR with the AI as Black. Each
 * game gets a distinct, pairing-derived seed so the run is reproducible but every
 * game is a different line.
 */
function playPair(tier: Difficulty, iterations: number): PairResult {
  const res: PairResult = {
    tier,
    iterations,
    aiWins: 0,
    mctsWins: 0,
    draws: 0,
    games: 0,
    nodes: 0,
    ms: 0,
    reasons: {},
  };
  const pairSalt = (DIFFICULTY_ORDER.indexOf(tier) * 31 + (iterations % 997)) * 1009;

  for (let g = 0; g < GAMES_PER_COLOUR; g++) {
    record(playGame(tier, iterations, true, BASE_SEED + pairSalt + g * 2));
    record(playGame(tier, iterations, false, BASE_SEED + pairSalt + g * 2 + 1));
  }
  return res;

  function record(r: GameResult) {
    res.games++;
    res.nodes += r.nodes;
    res.ms += r.ms;
    res.reasons[r.reason] = (res.reasons[r.reason] ?? 0) + 1;
    if (r.end === 'draw') res.draws++;
    else if (r.end === 'ai') res.aiWins++;
    else res.mctsWins++;
  }
}

// --------------------------------------------------------------------------
// Run the matrix
// --------------------------------------------------------------------------

console.log('=== Laska CROSS-FAMILY benchmark: production negamax AI vs MCTS/UCT ===');
console.log(
  `tiers: ${tiers.map((t) => `${t}(d${DIFFICULTY_DEPTH[t]})`).join(', ')}  |  ` +
    `MCTS budgets (iterations): ${MCTS_BUDGETS.join(', ')}  (rollout cap ${ROLLOUT_CAP})`,
);
console.log(
  `${GAMES_PER_COLOUR} games/colour (${GAMES_PER_COLOUR * 2}/pairing), ` +
    `ply cap ${PLY_CAP}, base seed ${BASE_SEED}, best-play (no blunder).`,
);
console.log('Matrix cell = AI win% (AI W / D / MCTS W). Higher = production AI stronger.\n');

const runStart = process.hrtime.bigint();
const results: PairResult[] = [];

for (const tier of tiers) {
  for (const iterations of MCTS_BUDGETS) {
    const r = playPair(tier, iterations);
    results.push(r);
    const reasons = Object.entries(r.reasons)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    const aiPct = ((r.aiWins / r.games) * 100).toFixed(0);
    console.log(
      `${tier.padEnd(12)} vs mcts(${String(iterations).padStart(4)})  ` +
        `${String(r.aiWins).padStart(2)}W ${String(r.draws).padStart(2)}D ${String(r.mctsWins).padStart(2)}L  ` +
        `(AI win% ${aiPct.padStart(3)}%)  [${reasons}]  ${(r.ms / r.games).toFixed(0)} ms/game`,
    );
  }
}
const runMs = Number(process.hrtime.bigint() - runStart) / 1e6;

// --------------------------------------------------------------------------
// Matrix (rows = tiers, columns = MCTS budgets), cell = AI win%
// --------------------------------------------------------------------------

const cell = new Map<string, string>();
for (const r of results) {
  const pct = ((r.aiWins / r.games) * 100).toFixed(0);
  cell.set(`${r.tier}|${r.iterations}`, `${pct}%(${r.aiWins}/${r.draws}/${r.mctsWins})`);
}

const W = 14;
console.log('\n=== AI-win% matrix (row = production tier, column = MCTS iterations) ===');
process.stdout.write('tier'.padEnd(13));
for (const it of MCTS_BUDGETS) process.stdout.write(`mcts${it}`.padStart(W));
process.stdout.write('\n');
for (const tier of tiers) {
  process.stdout.write(tier.padEnd(13));
  for (const it of MCTS_BUDGETS) {
    process.stdout.write((cell.get(`${tier}|${it}`) ?? '·').padStart(W));
  }
  process.stdout.write('\n');
}

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------

const totalGames = results.reduce((s, r) => s + r.games, 0);
const totalNodes = results.reduce((s, r) => s + r.nodes, 0);
const aiTotal = results.reduce((s, r) => s + r.aiWins, 0);
const mctsTotal = results.reduce((s, r) => s + r.mctsWins, 0);
const drawTotal = results.reduce((s, r) => s + r.draws, 0);
console.log(
  `\n${results.length} pairings, ${totalGames} games — AI ${aiTotal}W / ${drawTotal}D / ${mctsTotal}L overall, ` +
    `${totalNodes.toLocaleString()} AI search nodes, finished in ${(runMs / 1000).toFixed(1)}s.`,
);
