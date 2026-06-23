/**
 * SearchAgent — the classical family: negamax with alpha-beta pruning, the
 * Laska heuristic, optional quiescence (forced-capture extension) and optional
 * blunder injection. It is a thin, configurable wrapper over the EXISTING engine
 * search (`scoreMoves` in `ai.ts`) so the research layer and the shipping AI stay
 * bit-for-bit consistent — no second, drifting implementation of the core search.
 *
 * Every named difficulty personality in the ladder (Margot / Viktor / Dr. Lasker)
 * is just a SearchAgent with different knobs: search depth, blunder rate, and
 * whether quiescence is on. The playstyle differences are therefore real
 * move-selection differences, not flavour text.
 */
import type { GameState, Move, EvalWeights } from '../index.ts';
import { legalMoves, scoreMoves, DEFAULT_WEIGHTS } from '../index.ts';
import type { Agent, AgentContext } from './agent.ts';

export interface SearchAgentConfig {
  id: string;
  name: string;
  blurb: string;
  /** Search depth in plies (half-moves looked ahead). */
  depth: number;
  /** Probability [0,1] of playing a random legal move instead of the best. */
  blunderRate?: number;
  /** Search through pending forced captures at the leaves (horizon-effect fix). */
  quiescence?: boolean;
  /** Evaluation weights; defaults to the engine's `DEFAULT_WEIGHTS`. */
  weights?: EvalWeights;
}

export function createSearchAgent(cfg: SearchAgentConfig): Agent {
  const blunderRate = cfg.blunderRate ?? 0;
  const quiescence = cfg.quiescence ?? false;
  const weights = cfg.weights ?? DEFAULT_WEIGHTS;

  return {
    id: cfg.id,
    name: cfg.name,
    blurb: cfg.blurb,
    family: 'search',
    chooseMove(state: GameState, ctx?: AgentContext): Move | null {
      const moves = legalMoves(state);
      if (moves.length === 0) return null;
      if (moves.length === 1) return moves[0]!;
      const rng = ctx?.random ?? Math.random;

      // Deliberate blunder: pick any legal move at random. Keeps lower tiers
      // beatable and human (they sometimes overlook the right reply).
      if (blunderRate > 0 && rng() < blunderRate) {
        return moves[Math.floor(rng() * moves.length)]!;
      }

      const scored = scoreMoves(state, cfg.depth, { weights, quiescence });
      const bestScore = scored[0]!.score;
      // Break ties uniformly so the agent is not robotically predictable.
      const ties = scored.filter((s) => s.score === bestScore);
      return ties[Math.floor(rng() * ties.length)]!.move;
    },
  };
}
