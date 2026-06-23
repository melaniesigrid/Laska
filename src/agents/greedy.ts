/**
 * GreedyAgent — one-ply, heuristic-only move selection (no lookahead, no search).
 *
 * For every legal move it applies the move and scores the resulting position
 * with a SIMPLE, material-flavoured heuristic, then plays the highest-scoring
 * one. Crucially it uses its OWN deliberately-shallow evaluation (column control,
 * officer bonus, prisoners) and ignores the engine's mobility / advance /
 * quiescence machinery — so it is a genuinely distinct player, not just
 * "alpha-beta at depth 1". It loves grabbing captures and walks straight into
 * traps it cannot see past, which makes it a believable low-rung opponent and a
 * useful research datapoint (pure greedy vs. true search).
 */
import type { GameState, Move, PlayerColor } from '../types.ts';
import { legalMoves, applyMove, NUM_SQUARES } from '../index.ts';
import type { Agent, AgentContext } from './agent.ts';

/** Material-only weights — intentionally cruder than the engine's `evaluate`. */
const GREEDY_COLUMN = 100;
const GREEDY_OFFICER = 50;
const GREEDY_PRISONER = 20;

/**
 * Static, material-only score from `me`'s perspective. Counts column control,
 * officer commanders, and held prisoners — and nothing positional. This is the
 * whole point: a strong-ish gut instinct with no foresight.
 */
export function materialScore(state: GameState, me: PlayerColor): number {
  let score = 0;
  for (let sq = 0; sq < NUM_SQUARES; sq++) {
    const col = state.board[sq];
    if (!col || col.length === 0) continue;
    const top = col[col.length - 1]!;
    const sign = top.color === me ? 1 : -1;
    score += sign * GREEDY_COLUMN;
    if (top.rank === 'officer') score += sign * GREEDY_OFFICER;
    for (let i = 0; i < col.length - 1; i++) {
      if (col[i]!.color !== top.color) score += sign * GREEDY_PRISONER;
    }
  }
  return score;
}

export interface GreedyAgentOptions {
  id?: string;
  name?: string;
  blurb?: string;
}

export function createGreedyAgent(opts: GreedyAgentOptions = {}): Agent {
  return {
    id: opts.id ?? 'greedy',
    name: opts.name ?? 'Pip',
    blurb: opts.blurb ?? 'Grabs every capture in sight and never looks past his nose.',
    family: 'greedy',
    chooseMove(state: GameState, ctx?: AgentContext): Move | null {
      const moves = legalMoves(state);
      if (moves.length === 0) return null;
      if (moves.length === 1) return moves[0]!;
      const me = state.toMove;
      const rng = ctx?.random ?? Math.random;

      let best: Move[] = [];
      let bestScore = -Infinity;
      for (const move of moves) {
        // Score the position AFTER our move, from our own perspective.
        const after = applyMove(state, move);
        const s = materialScore(after, me);
        if (s > bestScore) {
          bestScore = s;
          best = [move];
        } else if (s === bestScore) {
          best.push(move);
        }
      }
      return best[Math.floor(rng() * best.length)]!;
    },
  };
}
