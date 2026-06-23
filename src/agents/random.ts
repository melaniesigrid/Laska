/**
 * RandomAgent — plays a uniformly random legal move.
 *
 * This is the research FLOOR: every other agent should beat it convincingly, so
 * it doubles as a sanity baseline ("is my new agent actually doing anything?").
 * As an opponent it is the absolute-beginner rung — it still obeys the forced
 * capture rule (because `legalMoves` only ever returns legal moves), so it is
 * not *illegal*, just aimless.
 */
import type { GameState, Move } from '../types.ts';
import { legalMoves } from '../index.ts';
import type { Agent, AgentContext } from './agent.ts';
import { pick } from './rng.ts';

export interface RandomAgentOptions {
  id?: string;
  name?: string;
  blurb?: string;
}

export function createRandomAgent(opts: RandomAgentOptions = {}): Agent {
  return {
    id: opts.id ?? 'random',
    name: opts.name ?? 'Cadet',
    blurb: opts.blurb ?? 'Throws pieces forward and hopes — pure random legal moves.',
    family: 'random',
    chooseMove(state: GameState, ctx?: AgentContext): Move | null {
      const moves = legalMoves(state);
      if (moves.length === 0) return null;
      const rng = ctx?.random ?? Math.random;
      return pick(moves, rng);
    },
  };
}
