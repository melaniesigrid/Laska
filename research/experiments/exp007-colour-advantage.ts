/**
 * EXP-007 — Is there a first-move (colour) advantage in Laska?
 * Reproducible harness for the notebook entry of the same name.
 *
 * Run from the repo root (Node >= 22, raw TS):
 *   node research/experiments/exp007-colour-advantage.ts
 *   node research/experiments/exp007-colour-advantage.ts --depth 6 --n 140 --open 4
 *
 * Protocol (the rigorous, colour-balanced one — see the notebook for the false
 * lead it replaced): generate a diverse opening by playing `open` uniform-random
 * plies (symmetric in expectation), then play the game out with the SAME search
 * agent on BOTH sides, and tally the winner by COLOUR. Because the openings are
 * symmetric, a persistent colour skew is a real first/second-mover effect rather
 * than an opening-selection bias. A Wilson 95% CI on White's share of *decisive*
 * games isolates the signal from Laska's high draw rate (notebook finding A2).
 *
 * Built on the canonical research substrate `src/agents/` (notebook decision
 * D-002), NOT a bespoke arena. Deterministic given the seed.
 *
 * Logged result (this code, seeds `20000 + i*7919`):
 *   depth 4, n=240, open=4 -> White 76.9% of decisive [95% CI 68.5-83.6%]  SIGNIFICANT
 *   depth 4, n=240, open=6 -> White 66.9% of decisive [95% CI 58.0-74.8%]  SIGNIFICANT
 *   depth 6, n=140, open=4 -> White 45.9% of decisive [95% CI 36.8-55.2%]  not significant
 * Verdict: the first-move advantage is DEPTH-DEPENDENT — significant at depth 4,
 * it evaporates by depth 6. No unqualified "first-mover advantage" claim is safe.
 */
import { createInitialState, legalMoves, applyMove, gameStatus, scoreMoves } from '../../src/index.ts';
import type { GameState, Move } from '../../src/index.ts';
import { createSearchAgent } from '../../src/agents/search.ts';
import { makeRng } from '../../src/agents/rng.ts';
import { SQUARE_TO_RC } from '../../src/index.ts';

// ---- tiny arg parser (no deps) ----
function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : def;
}
const DEPTH = arg('depth', 4);
const N = arg('n', 240);
const OPEN = arg('open', 4);

// ---- Wilson 95% CI for a binomial proportion ----
function wilson(wins: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96, p = wins / n, d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
}

function squareToAlg(sq: number): string {
  const rc = SQUARE_TO_RC[sq]!;
  return String.fromCharCode(97 + rc.col) + (rc.row + 1);
}
function san(m: Move): string {
  const f = squareToAlg(m.from);
  return m.isCapture ? f + m.path.map((p) => `x${squareToAlg(p)}`).join('') : `${f}-${squareToAlg(m.to)}`;
}

// ---- opening scan: score every legal first move at several depths ----
function openingScan() {
  console.log('=== OPENING SCAN (White to move, initial position) ===');
  const init = createInitialState();
  console.log('legal first moves:', legalMoves(init).length);
  for (const d of [2, 4, 6, 8]) {
    const scored = scoreMoves(init, d);
    const best = scored[0]!.score;
    const ties = scored.filter((s) => s.score === best).length;
    const top = scored.slice(0, 3).map((s) => `${san(s.move)} ${s.score.toFixed(0)}`).join('  ');
    console.log(`depth ${d}: best ${best.toFixed(0)}  tied-for-best ${ties}/${scored.length}  top: ${top}`);
  }
}

// ---- mirror self-play from a diverse opening ----
function play(agent: ReturnType<typeof createSearchAgent>, seed: number, open: number) {
  const r = makeRng(seed);
  let st: GameState = createInitialState();
  let plies = 0;
  while (plies < 400) {
    const s = gameStatus(st);
    if (s.state !== 'ongoing') return { winner: s.state === 'win' ? s.winner : 'draw', plies };
    const moves = legalMoves(st);
    const m: Move = plies < open ? moves[Math.floor(r() * moves.length)]! : agent.chooseMove(st, { random: r })!;
    st = applyMove(st, m);
    plies++;
  }
  return { winner: 'draw' as const, plies };
}

function colourStudy(depth: number, n: number, open: number) {
  console.log(`\n=== FIRST-MOVE (COLOUR) ADVANTAGE — mirror self-play, Wilson 95% CI ===`);
  const agent = createSearchAgent({ id: 'mirror', name: 'Mirror', blurb: '', depth });
  let W = 0, B = 0, D = 0, ply = 0;
  for (let i = 0; i < n; i++) {
    const g = play(agent, 20000 + i * 7919, open);
    if (g.winner === 'W') W++;
    else if (g.winner === 'B') B++;
    else D++;
    ply += g.plies;
  }
  const dec = W + B;
  const [lo, hi] = wilson(W, dec);
  const sig = dec > 0 && (hi < 0.5 || lo > 0.5) ? 'SIGNIFICANT colour skew' : 'not significant (CI spans 50%)';
  console.log(`depth ${depth}, n=${n}, open=${open}: W ${W}  B ${B}  D ${D} (${((100 * D) / n).toFixed(0)}% draws)  avg ${(ply / n).toFixed(0)} plies`);
  console.log(`   White share of ${dec} decisive games = ${dec ? ((100 * W) / dec).toFixed(1) : '-'}%  [95% CI ${(100 * lo).toFixed(1)}-${(100 * hi).toFixed(1)}%]  -> ${dec ? sig : 'no decisive games'}`);
}

openingScan();
colourStudy(DEPTH, N, OPEN);
