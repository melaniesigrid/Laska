/**
 * Laska AI opponent — negamax search with alpha-beta pruning over the
 * column-aware move generator in `rules.ts`, plus a Laska-specific heuristic.
 *
 * This module is pure and standalone (no UI / networking). It depends only on
 * the rules engine, so it can run on a client for offline single-player or on
 * the server as a bot fallback.
 *
 * Design notes:
 *  - Laska is decisive and forced-capture-heavy, so the effective branching
 *    factor is low and modest depths play a strong game.
 *  - The evaluation is from the perspective of the side to move (negamax form):
 *    a positive score is good for whoever is to move at the root.
 *  - "Material" in Laska is column CONTROL, not raw piece count — every piece is
 *    permanent (captures only bury, never remove), so what matters is how many
 *    columns you command and what you have buried beneath your commanders.
 */

import type { GameState, Move, PlayerColor } from './types.ts';
import { NUM_SQUARES, SQUARE_TO_RC, BOARD_DIM, promotionRow } from './board.ts';
import { legalMoves, applyMove, gameStatus, opponent } from './rules.ts';

// --------------------------------------------------------------------------
// Evaluation
// --------------------------------------------------------------------------

/** Heuristic weights. Tunable; chosen to be reasonable, not yet match-tuned. */
export interface EvalWeights {
  /** Value of controlling a column at all (a "piece in play"). */
  column: number;
  /** Extra value when your commander is an officer (moves both ways). */
  officer: number;
  /** Value of each enemy piece buried (immobilised) beneath your commander. */
  enemyPrisoner: number;
  /** Penalty for each of your own pieces buried beneath an enemy commander. */
  ownCaptured: number;
  /** Per-row value of advancing a soldier-topped column toward promotion. */
  advance: number;
  /** Value of each legal move available (mobility). */
  mobility: number;
}

export const DEFAULT_WEIGHTS: EvalWeights = {
  column: 100,
  officer: 60,
  enemyPrisoner: 18,
  ownCaptured: 12,
  advance: 6,
  mobility: 2,
};

/** A decisive result is scored near ±this, offset by depth to prefer faster wins. */
const WIN_SCORE = 1_000_000;

/**
 * Static evaluation from `me`'s perspective (higher is better for `me`).
 * Does NOT check terminal status — the search handles terminal nodes.
 */
export function evaluate(state: GameState, me: PlayerColor, w: EvalWeights = DEFAULT_WEIGHTS): number {
  const them = opponent(me);
  let score = 0;

  for (let sq = 0; sq < NUM_SQUARES; sq++) {
    const col = state.board[sq];
    if (!col || col.length === 0) continue;
    const top = col[col.length - 1]!;
    const controller = top.color;
    const sign = controller === me ? 1 : -1;

    // Column control + officer bonus.
    score += sign * w.column;
    if (top.rank === 'officer') score += sign * w.officer;

    // Buried pieces: enemy-of-controller pieces are prisoners (good for the
    // controller); same-colour buried pieces are just stacked reserves.
    for (let i = 0; i < col.length - 1; i++) {
      const buried = col[i]!;
      if (buried.color !== controller) {
        // The controller holds an enemy prisoner.
        score += sign * w.enemyPrisoner;
      }
    }

    // Promotion threat: reward soldier-topped columns nearing the back rank.
    if (top.rank === 'soldier') {
      const row = SQUARE_TO_RC[sq]!.row;
      const target = promotionRow(controller);
      const distance = Math.abs(target - row); // 0 at back rank
      const advanced = (BOARD_DIM - 1 - distance); // larger = closer to promotion
      score += sign * w.advance * advanced;
    }
  }

  // Mobility: difference in number of legal moves. Computed for both sides from
  // the current board (cheap relative to the rest of the search at low depth).
  const myMoves = legalMoves({ ...state, toMove: me }).length;
  const theirMoves = legalMoves({ ...state, toMove: them }).length;
  score += w.mobility * (myMoves - theirMoves);

  return score;
}

// --------------------------------------------------------------------------
// Search
// --------------------------------------------------------------------------

/**
 * Order moves to improve alpha-beta cuts: captures first (more of them when
 * forced anyway), then promotions, then longer capture chains earlier.
 */
function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    if (a.isCapture !== b.isCapture) return a.isCapture ? -1 : 1;
    if (a.captures.length !== b.captures.length) return b.captures.length - a.captures.length;
    if (a.promotion !== b.promotion) return a.promotion ? -1 : 1;
    return 0;
  });
}

/**
 * Negamax with alpha-beta. Returns the score from the perspective of the side
 * to move in `state`. `root` is the colour we are optimising for is implicit in
 * the negamax sign flips; here we always evaluate for `state.toMove`.
 */
function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  weights: EvalWeights,
): number {
  const status = gameStatus(state);
  if (status.state === 'win') {
    // The side to move has lost if the winner is the opponent. gameStatus is
    // called on `state` whose `toMove` is the side that must move; a 'no-moves'
    // or 'no-pieces' win always names the opponent of `toMove` as winner.
    // From the perspective of `state.toMove`, this is a loss.
    return -(WIN_SCORE - (100 - depth)); // prefer being mated later
  }
  if (status.state === 'draw') {
    return 0;
  }
  if (depth === 0) {
    return evaluate(state, state.toMove, weights);
  }

  let best = -Infinity;
  const moves = orderMoves(legalMoves(state));
  for (const move of moves) {
    const child = applyMove(state, move);
    const score = -negamax(child, depth - 1, -beta, -alpha, weights);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // beta cutoff
  }
  return best;
}

export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard';

export interface AIOptions {
  difficulty?: Difficulty;
  /** Override search depth (plies). Takes precedence over `difficulty`. */
  depth?: number;
  /**
   * Probability [0,1] of playing a random legal move instead of the best one,
   * to make lower tiers beatable and less robotic. Defaults per difficulty.
   */
  blunderRate?: number;
  /** Deterministic RNG in [0,1) for reproducible tests. Defaults to Math.random. */
  random?: () => number;
  weights?: EvalWeights;
}

const DIFFICULTY_DEPTH: Record<Difficulty, number> = {
  beginner: 1,
  easy: 2,
  medium: 4,
  hard: 6,
};

const DIFFICULTY_BLUNDER: Record<Difficulty, number> = {
  beginner: 0.45,
  easy: 0.2,
  medium: 0.05,
  hard: 0,
};

export interface ScoredMove {
  move: Move;
  score: number;
}

/**
 * Score every legal move at the given depth. Useful for analysis / hint UIs.
 * Scores are from the perspective of the side to move.
 */
export function scoreMoves(
  state: GameState,
  depth: number,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): ScoredMove[] {
  const moves = orderMoves(legalMoves(state));
  const scored: ScoredMove[] = [];
  // Use a full window per root move so every move gets an EXACT score (needed
  // for honest analysis and reliable tie detection). Pruning still happens
  // deep inside each child search.
  for (const move of moves) {
    const child = applyMove(state, move);
    const score = -negamax(child, depth - 1, -Infinity, Infinity, weights);
    scored.push({ move, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Choose a move for the side to move. Returns `null` only if there are no legal
 * moves (i.e. the game is already lost for the side to move).
 */
export function chooseMove(state: GameState, opts: AIOptions = {}): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0]!;

  const difficulty = opts.difficulty ?? 'medium';
  const depth = opts.depth ?? DIFFICULTY_DEPTH[difficulty];
  const blunderRate = opts.blunderRate ?? DIFFICULTY_BLUNDER[difficulty];
  const rng = opts.random ?? Math.random;
  const weights = opts.weights ?? DEFAULT_WEIGHTS;

  if (blunderRate > 0 && rng() < blunderRate) {
    return moves[Math.floor(rng() * moves.length)]!;
  }

  const scored = scoreMoves(state, depth, weights);
  const bestScore = scored[0]!.score;
  // Pick uniformly among moves that tie for best, for variety.
  const ties = scored.filter((s) => s.score === bestScore);
  return ties[Math.floor(rng() * ties.length)]!.move;
}
