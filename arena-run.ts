/**
 * Runnable AI tournament — pits the roster against itself and prints a standings
 * table plus the head-to-head matrix. This is the research dashboard:
 *
 *   node arena-run.ts                      # default: ladder, 20 games/pairing
 *   node arena-run.ts --games 40           # more games = tighter estimates
 *   node arena-run.ts --agents cadet,pip,viktor
 *   node arena-run.ts --all                # include the MCTS wildcard (slow)
 *
 * Results are seeded, so a given invocation is fully reproducible.
 */
import { LADDER, ROSTER, monte, roundRobin, getAgent } from './src/agents/index.ts';
import type { Agent } from './src/agents/index.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const games = Number(arg('games') ?? 20);
const seed = Number(arg('seed') ?? 7);

let agents: Agent[];
const list = arg('agents');
if (list) {
  agents = list.split(',').map((s) => getAgent(s.trim()));
} else if (has('all')) {
  agents = [...LADDER, monte];
} else {
  agents = [...LADDER];
}

console.log(`\nLaska AI Arena — ${agents.length} agents, ${games} games/pairing, seed ${seed}\n`);
console.log('Roster:');
for (const a of agents) console.log(`  ${a.name.padEnd(10)} [${a.id}] (${a.family}) — ${a.blurb}`);

const t0 = process.hrtime.bigint();
const { matches, standings } = roundRobin(agents, { games, seed });
const t1 = process.hrtime.bigint();

console.log('\n=== Standings (win=1, draw=0.5) ===');
console.log('  #  Agent        Pts    W   D   L   Games   Win%');
standings.forEach((s, i) => {
  const winPct = ((s.wins / s.games) * 100).toFixed(0);
  console.log(
    `  ${String(i + 1).padStart(2)}  ${s.name.padEnd(11)} ${s.points.toFixed(1).padStart(5)}  ` +
      `${String(s.wins).padStart(2)}  ${String(s.draws).padStart(2)}  ${String(s.losses).padStart(2)}  ` +
      `${String(s.games).padStart(5)}   ${winPct.padStart(3)}%`,
  );
});

console.log('\n=== Head-to-head (row agent wins / draws / losses vs column) ===');
for (const m of matches) {
  const a = ROSTER[m.a]!;
  const b = ROSTER[m.b]!;
  console.log(`  ${a.name.padEnd(10)} vs ${b.name.padEnd(10)}: ${m.aWins}W / ${m.draws}D / ${m.bWins}L`);
}

console.log(`\nTournament finished in ${(Number(t1 - t0) / 1e9).toFixed(1)}s.`);
