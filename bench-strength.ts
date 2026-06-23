/**
 * Self-play STRENGTH benchmark — pits the production AI difficulty tiers
 * (`chooseMove` / `DIFFICULTY_ORDER` / `DIFFICULTY_DEPTH`) against each other and
 * prints a win/loss/draw matrix, so we can detect strength regressions over time.
 *
 * This is the strength counterpart to `bench-baseline.ts` (which measures search
 * SPEED). It answers a different question: "does a higher tier actually beat a
 * lower one, and by how much?" A change that makes the search faster but a tier
 * stops reliably beating the tier below it is a real regression this surfaces.
 *
 * Determinism: every game is driven by a seeded mulberry32 RNG (`makeRng`), the
 * same generator the agent arena and tests use. `chooseMove` takes that RNG for
 * BOTH its blunder roll and its tie-break, so a given (pair, color, seed) is
 * fully reproducible — re-running yields the identical matrix. (See the charter
 * determinism guardrail.)
 *
 * Colour fairness: each pairing plays an even split with colours swapped, so
 * White's first-move advantage cancels out of the head-to-head.
 *
 * Termination: Laska captures only BURY pieces (nothing leaves the board), so two
 * strong, near-deterministic tiers can shuffle for a very long time. We rely on
 * the engine's own draw rules via `gameStatus` AND a hard ply cap with a draw
 * fallback, plus a per-game wall-clock guard, so no game can hang the run.
 *
 * Usage (all flags optional):
 *   node bench-strength.ts                       # fast smoke: beginner..medium, 2 games/colour
 *   node bench-strength.ts --games 6             # 6 games per colour (12 per pairing)
 *   node bench-strength.ts --full                # add 'hard' + 'expert' (SLOW: depth 6/8 search)
 *   node bench-strength.ts --tiers beginner,medium,hard
 *   node bench-strength.ts --adjacent            # only adjacent tier pairs (cheaper)
 *   node bench-strength.ts --cap 120 --seed 7    # ply cap + base seed
 *   node bench-strength.ts --no-blunder          # force best-play (no tier blunder roll)
 */
import { createInitialState, applyMove, gameStatus, chooseMove } from './src/index.ts';
import { DIFFICULTY_ORDER, DIFFICULTY_DEPTH, type Difficulty } from './src/index.ts';
import { newStats, type SearchStats } from './src/ai.ts';
import { makeRng } from './src/agents/index.ts';
import type { GameState, PlayerColor } from './src/types.ts';

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const GAMES_PER_COLOUR = Number(arg('games') ?? 2);
const PLY_CAP = Number(arg('cap') ?? 100);
const BASE_SEED = Number(arg('seed') ?? 7);
const FULL = has('full');
const ADJACENT_ONLY = has('adjacent');
const NO_BLUNDER = has('no-blunder');
/** Per-game wall-clock guard (ms): a game past this is recorded as an unfinished draw. */
const GAME_TIME_BUDGET_MS = Number(arg('budget') ?? 8000);

let tiers: Difficulty[];
const tierArg = arg('tiers');
if (tierArg) {
  tiers = tierArg.split(',').map((s) => s.trim()) as Difficulty[];
  for (const t of tiers) {
    if (!DIFFICULTY_ORDER.includes(t)) throw new Error(`unknown tier "${t}"`);
  }
} else {
  // Default smoke run excludes the two deep-search tiers ('hard' = depth 6,
  // 'expert' = depth 8): with Laska's bury-not-remove captures, near-best games
  // between deep tiers can run to the ply cap and dominate the wall clock. Pass
  // --full to include them. Ordered weakest -> strongest.
  const SLOW: Difficulty[] = ['hard', 'expert'];
  tiers = DIFFICULTY_ORDER.filter((t) => FULL || !SLOW.includes(t));
}

// --------------------------------------------------------------------------
// One game
// --------------------------------------------------------------------------

type GameEnd = 'white' | 'black' | 'draw';

interface GameResult {
  end: GameEnd;
  plies: number;
  /** Why the game stopped: an engine outcome reason, or a harness fallback. */
  reason: string;
  /** Search nodes summed across all of this game's moves (both sides). */
  nodes: number;
  ms: number;
}

/**
 * Play one game: `white` and `black` are difficulty tiers. The same seeded RNG
 * drives both sides' move selection, so the game is fully reproducible.
 */
function playGame(
  white: Difficulty,
  black: Difficulty,
  seed: number,
): GameResult {
  let state: GameState = createInitialState();
  const rng = makeRng(seed);
  const stats: SearchStats = newStats();
  const t0 = process.hrtime.bigint();
  let plies = 0;

  for (; plies < PLY_CAP; plies++) {
    const status = gameStatus(state);
    if (status.state === 'win') {
      // The side to move has lost (no pieces / no moves); the winner is recorded.
      return finish(status.winner === 'W' ? 'white' : 'black', status.reason);
    }
    if (status.state === 'draw') return finish('draw', status.reason);

    if (Number(process.hrtime.bigint() - t0) / 1e6 > GAME_TIME_BUDGET_MS) {
      return finish('draw', 'time-budget');
    }

    const tier: Difficulty = state.toMove === 'W' ? white : black;
    const move = chooseMove(state, {
      difficulty: tier,
      random: rng,
      stats,
      ...(NO_BLUNDER ? { blunderRate: 0 } : {}),
    });
    if (!move) {
      // No legal move = current side loses (defensive; gameStatus catches this).
      return finish(state.toMove === 'W' ? 'black' : 'white', 'no-moves');
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
  a: Difficulty;
  b: Difficulty;
  aWins: number;
  bWins: number;
  draws: number;
  games: number;
  nodes: number;
  ms: number;
  reasons: Record<string, number>;
}

/**
 * Play `a` vs `b` with colours balanced: GAMES_PER_COLOUR games with `a` as
 * White, then GAMES_PER_COLOUR with `a` as Black. Each game gets a distinct seed
 * derived from the base seed and the pairing, so the whole run is reproducible
 * but every game is a different line.
 */
function playPair(a: Difficulty, b: Difficulty): PairResult {
  const res: PairResult = { a, b, aWins: 0, bWins: 0, draws: 0, games: 0, nodes: 0, ms: 0, reasons: {} };
  const pairSalt = (DIFFICULTY_ORDER.indexOf(a) * 31 + DIFFICULTY_ORDER.indexOf(b)) * 1009;

  for (let g = 0; g < GAMES_PER_COLOUR; g++) {
    // a = White.
    record(playGame(a, b, BASE_SEED + pairSalt + g * 2), 'white');
    // a = Black (colours swapped).
    record(playGame(b, a, BASE_SEED + pairSalt + g * 2 + 1), 'black');
  }
  return res;

  function record(r: GameResult, aColour: 'white' | 'black') {
    res.games++;
    res.nodes += r.nodes;
    res.ms += r.ms;
    res.reasons[r.reason] = (res.reasons[r.reason] ?? 0) + 1;
    if (r.end === 'draw') res.draws++;
    else if (r.end === aColour) res.aWins++;
    else res.bWins++;
  }
}

// --------------------------------------------------------------------------
// Run the matrix
// --------------------------------------------------------------------------

function pairs(ts: Difficulty[]): [Difficulty, Difficulty][] {
  const out: [Difficulty, Difficulty][] = [];
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      if (ADJACENT_ONLY && j !== i + 1) continue;
      out.push([ts[i]!, ts[j]!]);
    }
  }
  return out;
}

console.log('=== Laska self-play STRENGTH benchmark ===');
console.log(
  `tiers: ${tiers.map((t) => `${t}(d${DIFFICULTY_DEPTH[t]})`).join(', ')}`,
);
console.log(
  `${GAMES_PER_COLOUR} games/colour (${GAMES_PER_COLOUR * 2}/pairing), ` +
    `ply cap ${PLY_CAP}, seed ${BASE_SEED}` +
    `${ADJACENT_ONLY ? ', adjacent only' : ''}${NO_BLUNDER ? ', best-play (no blunder)' : ''}`,
);
console.log('Reading row vs column header: cell = (row-tier wins) - (col-tier wins), draws in parens.\n');

const all = pairs(tiers);
const runStart = process.hrtime.bigint();
const results: PairResult[] = [];
// Win counts per tier, keyed by tier name, for the standings summary.
const wins: Record<string, number> = {};
const losses: Record<string, number> = {};
const draws: Record<string, number> = {};
for (const t of tiers) { wins[t] = 0; losses[t] = 0; draws[t] = 0; }

for (const [a, b] of all) {
  const r = playPair(a, b);
  results.push(r);
  wins[a]! += r.aWins; wins[b]! += r.bWins;
  losses[a]! += r.bWins; losses[b]! += r.aWins;
  draws[a]! += r.draws; draws[b]! += r.draws;
  const reasons = Object.entries(r.reasons).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(
    `${a.padEnd(12)} vs ${b.padEnd(12)}  ` +
      `${String(r.aWins).padStart(2)}W ${String(r.draws).padStart(2)}D ${String(r.bWins).padStart(2)}L  ` +
      `(${a} win% ${((r.aWins / r.games) * 100).toFixed(0)}%)  ` +
      `[${reasons}]  ${(r.ms / r.games).toFixed(0)} ms/game`,
  );
}
const runMs = Number(process.hrtime.bigint() - runStart) / 1e6;

// --------------------------------------------------------------------------
// Matrix
// --------------------------------------------------------------------------

const cell = new Map<string, string>();
for (const r of results) {
  const diffAB = r.aWins - r.bWins;
  cell.set(`${r.a}|${r.b}`, `${diffAB >= 0 ? '+' : ''}${diffAB}(${r.draws})`);
  cell.set(`${r.b}|${r.a}`, `${-diffAB >= 0 ? '+' : ''}${-diffAB}(${r.draws})`);
}

const W = 11;
console.log('\n=== Win-margin matrix (row score minus column score; +N = row beat column by N) ===');
process.stdout.write(''.padEnd(13));
for (const c of tiers) process.stdout.write(c.slice(0, W).padStart(W));
process.stdout.write('\n');
for (const r of tiers) {
  process.stdout.write(r.padEnd(13));
  for (const c of tiers) {
    if (r === c) { process.stdout.write('—'.padStart(W)); continue; }
    process.stdout.write((cell.get(`${r}|${c}`) ?? '·').padStart(W));
  }
  process.stdout.write('\n');
}

// --------------------------------------------------------------------------
// Standings + sanity check
// --------------------------------------------------------------------------

console.log('\n=== Standings (across all pairings) ===');
console.log('  tier          W   D   L   win%');
for (const t of tiers) {
  const g = wins[t]! + losses[t]! + draws[t]!;
  const pct = g ? ((wins[t]! / g) * 100).toFixed(0) : '0';
  console.log(
    `  ${t.padEnd(12)} ${String(wins[t]).padStart(2)}  ${String(draws[t]).padStart(2)}  ` +
      `${String(losses[t]).padStart(2)}   ${pct.padStart(3)}%`,
  );
}

// Monotonicity check: a stronger tier should not LOSE its head-to-head to a
// weaker one. Flag any inversion as a possible strength regression / finding.
console.log('\n=== Ladder monotonicity (stronger tier should win each head-to-head) ===');
let inversions = 0;
for (const r of results) {
  const stronger = DIFFICULTY_ORDER.indexOf(r.a) > DIFFICULTY_ORDER.indexOf(r.b) ? r.a : r.b;
  const sWins = stronger === r.a ? r.aWins : r.bWins;
  const wWins = stronger === r.a ? r.bWins : r.aWins;
  if (sWins < wWins) {
    inversions++;
    console.log(`  ⚠ INVERSION: ${stronger} (stronger) lost head-to-head ${sWins}-${wWins}`);
  }
}
if (inversions === 0) console.log('  OK — every stronger tier won (or tied) its head-to-head.');

const totalGames = results.reduce((s, r) => s + r.games, 0);
const totalNodes = results.reduce((s, r) => s + r.nodes, 0);
console.log(
  `\n${all.length} pairings, ${totalGames} games, ` +
    `${totalNodes.toLocaleString()} total search nodes, finished in ${(runMs / 1000).toFixed(1)}s.`,
);
