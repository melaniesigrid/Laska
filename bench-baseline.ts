import { createInitialState, legalMoves, applyMove, gameStatus } from './src/index.ts';
import { DEFAULT_WEIGHTS, evaluate } from './src/ai.ts';
import type { GameState, Move } from './src/types.ts';

const WIN = 1_000_000;
let nodes = 0;
function order(moves: Move[]): Move[] {
  return [...moves].sort((a,b) => {
    if (a.isCapture !== b.isCapture) return a.isCapture ? -1 : 1;
    if (a.captures.length !== b.captures.length) return b.captures.length - a.captures.length;
    if (a.promotion !== b.promotion) return a.promotion ? -1 : 1;
    return 0;
  });
}
function nega(s: GameState, d: number, a: number, b: number): number {
  nodes++;
  const st = gameStatus(s);
  if (st.state === 'win') return -(WIN - (100 - d));
  if (st.state === 'draw') return 0;
  if (d === 0) return evaluate(s, s.toMove, DEFAULT_WEIGHTS);
  let best = -Infinity;
  for (const m of order(legalMoves(s))) {
    const score = -nega(applyMove(s, m), d-1, -b, -a);
    if (score > best) best = score;
    if (best > a) a = best;
    if (a >= b) break;
  }
  return best;
}
function rootSearch(s: GameState, depth: number) {
  nodes = 0;
  const t0 = process.hrtime.bigint();
  for (const m of order(legalMoves(s))) nega(applyMove(s, m), depth-1, -Infinity, Infinity);
  const t1 = process.hrtime.bigint();
  return { nodes, ms: Number(t1-t0)/1e6 };
}
console.log('=== Baseline (opening position, full-window-per-root like scoreMoves) ===');
for (const d of [1,2,3,4,6,8]) {
  const r = rootSearch(createInitialState(), d);
  console.log(`depth ${d}: ${r.nodes.toLocaleString()} nodes, ${r.ms.toFixed(1)} ms, ${(r.nodes/Math.max(r.ms,0.001)*1000/1e6).toFixed(2)} M nodes/s`);
}
console.log('\n=== Per-move @ depth 8, first 12 plies of a self-play game ===');
let st = createInitialState();
let totMs = 0, totNodes = 0, n = 0;
for (let ply = 0; ply < 12 && gameStatus(st).state === 'ongoing'; ply++) {
  const r = rootSearch(st, 8);
  totMs += r.ms; totNodes += r.nodes; n++;
  const moves = order(legalMoves(st));
  let bestM = moves[0]!, bestS = -Infinity;
  for (const m of moves) { const sc = -nega(applyMove(st,m),7,-Infinity,Infinity); if (sc>bestS){bestS=sc;bestM=m;} }
  st = applyMove(st, bestM);
}
console.log(`avg over ${n} moves: ${(totMs/n).toFixed(1)} ms/move, ${Math.round(totNodes/n).toLocaleString()} nodes/move`);
