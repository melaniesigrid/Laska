/**
 * The agent ROSTER — every named, personality-driven opponent plus the research
 * baselines, each tied to a concrete engineering lever (not just a depth slider).
 *
 * This is the single place that maps "personality" → "actual algorithm + knobs",
 * so the difficulty ladder, the in-app opponent picker, and the research arena
 * all draw from one source of truth. Add a new AI by adding it here; keep old
 * ones so you can always reproduce a past comparison.
 *
 * THE LADDER (ascending in expected strength — verify by running the arena):
 *   Cadet     — RandomAgent .............. absolute floor; aimless but legal.
 *   Pip       — GreedyAgent (1-ply) ...... grabs captures, no foresight.
 *   Margot    — SearchAgent d3, blunders . cautious club player.
 *   Viktor    — SearchAgent d6 + quiesce . calculating tactician.
 *   Dr. Lasker— SearchAgent d10 + quiesce  the master (homage to the inventor).
 * Plus a stylistic wildcard that is NOT placed on the strength ladder until
 * measured:
 *   Monte     — MctsAgent (UCT) ......... different algorithm, different feel.
 */
import type { Agent } from './agent.ts';
import { createRandomAgent } from './random.ts';
import { createGreedyAgent } from './greedy.ts';
import { createSearchAgent } from './search.ts';
import { createMctsAgent } from './mcts.ts';

/** Cadet — the floor. Pure random legal play. */
export const cadet: Agent = createRandomAgent({
  id: 'cadet',
  name: 'Cadet',
  blurb: 'Fresh off the parade ground — throws pieces forward and hopes.',
});

/** Pip — greedy, one-ply, material-only. Loves captures, sees no consequences. */
export const pip: Agent = createGreedyAgent({
  id: 'pip',
  name: 'Pip',
  blurb: 'The eager novice: grabs every capture in sight and never looks past his nose.',
});

/** Margot — solid but unimaginative; a shallow search that sometimes wanders. */
export const margot: Agent = createSearchAgent({
  id: 'margot',
  name: 'Margot',
  blurb: 'The cautious club player: solid, unflashy, and occasionally distracted.',
  depth: 3,
  blunderRate: 0.12,
  quiescence: false,
});

/** Viktor — deep alpha-beta with quiescence; punishes loose tactical play. */
export const viktor: Agent = createSearchAgent({
  id: 'viktor',
  name: 'Viktor',
  blurb: 'The calculating tactician: reads the exchanges and punishes a loose move.',
  depth: 6,
  blunderRate: 0.01,
  quiescence: true,
});

/** Dr. Lasker — full-strength search. Patient, deep, near-flawless tactically.
 *  Named in homage to Emanuel Lasker, who invented the game in 1911. */
export const drLasker: Agent = createSearchAgent({
  id: 'dr-lasker',
  name: 'Dr. Lasker',
  blurb: 'The master: patient, deep, and unforgiving — plays for the long structural win.',
  depth: 10,
  blunderRate: 0,
  quiescence: true,
});

/** Monte — MCTS/UCT. A different algorithm entirely; a stylistic wildcard. */
export const monte: Agent = createMctsAgent({
  id: 'monte',
  name: 'Monte',
  iterations: 2000,
  blurb: 'The wildcard: simulates thousands of random futures — sometimes brilliant, sometimes naive.',
});

/** The difficulty ladder, ascending in expected strength (Monte excluded —
 *  its rank is unknown until measured by the arena). */
export const LADDER: readonly Agent[] = [cadet, pip, margot, viktor, drLasker];

/** Every agent, keyed by id (ladder + the wildcard + raw baselines). */
export const ROSTER: Readonly<Record<string, Agent>> = {
  cadet,
  pip,
  margot,
  viktor,
  'dr-lasker': drLasker,
  monte,
};

/** Look up an agent by id, throwing a helpful error on an unknown id. */
export function getAgent(id: string): Agent {
  const agent = ROSTER[id];
  if (!agent) {
    throw new Error(`Unknown agent id "${id}". Known: ${Object.keys(ROSTER).join(', ')}`);
  }
  return agent;
}
