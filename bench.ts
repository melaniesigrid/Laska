/**
 * Engine benchmark — the measured numbers behind AI.md §5 and the in-app
 * "How the AI Works" explainer. Run:  node bench.ts   (Node >= 22).
 *
 * Reports opening-position node counts per depth, alpha-beta vs plain-negamax
 * node ratio, the quiescence (forced-capture extension) cost on a real midgame
 * position, and per-move wall-clock at Expert. Timings are machine-dependent
 * and approximate; node counts are exact and reproducible.
 */
import { createInitialState, applyMove, gameStatus } from './src/index.ts';
import { scoreMoves, chooseMove, newStats } from './src/ai.ts';
import type { GameState } from './src/types.ts';
import type { ScoreOptions } from './src/ai.ts';
import { writeSync } from 'node:fs';
const out = (s: string) => writeSync(1, s + '\n');
const time = <T>(fn: () => T) => { const t0 = process.hrtime.bigint(); const o = fn(); return { ms: Number(process.hrtime.bigint()-t0)/1e6, o }; };

out('=== Opening search (scoreMoves, alpha-beta on) ===');
out('depth |  nodes | leaves | cutoffs | maxPly |   ms');
for (const d of [1,2,3,4,6,8]) {
  const s = newStats();
  const { ms } = time(() => scoreMoves(createInitialState(), d, { stats: s }));
  out(`${String(d).padStart(5)} | ${String(s.nodes).padStart(6)} | ${String(s.leaves).padStart(6)} | ${String(s.cutoffs).padStart(7)} | ${String(s.maxPlyReached).padStart(6)} | ${ms.toFixed(1)}`);
}
out('');
out('=== Alpha-beta vs plain negamax (opening, depth 6) ===');
{ const a=newStats(); scoreMoves(createInitialState(),6,{prune:true,stats:a});
  const b=newStats(); scoreMoves(createInitialState(),6,{prune:false,stats:b});
  out(`alpha-beta ${a.nodes} nodes | plain ${b.nodes} nodes | pruned ${(100*(1-a.nodes/b.nodes)).toFixed(0)}%`); }
out('');
// Build a midgame position (~16 plies of medium self-play, no quiescence => fast)
let mid = createInitialState(); let s=7; const rng=()=>(s=(s*1664525+1013904223)>>>0)/0x100000000;
for (let p=0;p<16 && gameStatus(mid).state==='ongoing';p++) mid = applyMove(mid, chooseMove(mid,{depth:3,blunderRate:0.1,random:rng}));
out('=== Midgame probe (a ~16-ply position) ===');
for (const [label,opts] of [['plain   d8',{stats:null}],['quiesce d8',{quiescence:true}]]) {
  const st=newStats(); const {ms}=time(()=>scoreMoves(mid,8,{...opts,stats:st}));
  out(`${label}: ${String(st.nodes).padStart(7)} nodes, ${ms.toFixed(0)} ms, maxPly ${st.maxPlyReached}, qNodes ${st.qNodes}`);
}
out('');
out('=== Per-move cost, self-play, expert depth 8 (10 plies) ===');
{ let st=createInitialState(), tot=0,totN=0,n=0,mx=0; let s2=11; const r=()=>(s2=(s2*1664525+1013904223)>>>0)/0x100000000;
  for(let p=0;p<10 && gameStatus(st).state==='ongoing';p++){ const stt=newStats(); const {ms}=time(()=>chooseMove(st,{difficulty:'expert',stats:stt,random:r}));
    tot+=ms;totN+=stt.nodes;n++;mx=Math.max(mx,ms); st=applyMove(st,chooseMove(st,{difficulty:'expert',random:r})); }
  out(`avg ${(tot/n).toFixed(0)} ms/move (worst ${mx.toFixed(0)} ms), ${Math.round(totN/n)} nodes/move`); }
out('DONE');
