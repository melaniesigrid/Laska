/**
 * Public surface for the AGENT RESEARCH LAYER — pluggable move-selection AIs and
 * the arena that compares them. Kept separate from the engine's public API
 * (`src/index.ts`) on purpose: the engine is the rules; this is the players.
 *
 * Import everything research-related from here, e.g.
 *   import { ROSTER, roundRobin } from './agents/index.ts';
 */
export type { Agent, AgentContext, AgentFamily } from './agent.ts';
export { makeRng, pick } from './rng.ts';

export { createRandomAgent } from './random.ts';
export { createGreedyAgent, materialScore } from './greedy.ts';
export { createSearchAgent, type SearchAgentConfig } from './search.ts';
export { createMctsAgent, type MctsAgentConfig } from './mcts.ts';

export {
  cadet,
  pip,
  margot,
  viktor,
  drLasker,
  monte,
  LADDER,
  ROSTER,
  getAgent,
} from './registry.ts';

export {
  playGame,
  playMatch,
  roundRobin,
  type GameRecord,
  type GameWinner,
  type MatchResult,
  type Standing,
  type RoundRobinResult,
  type PlayGameOptions,
  type PlayMatchOptions,
  type RoundRobinOptions,
} from './arena.ts';
