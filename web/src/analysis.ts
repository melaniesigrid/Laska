/**
 * Pure helpers for turning raw engine scores into human-readable analysis —
 * shared by the live-game hint banner and the post-game review in the saved-game
 * replay. No React, no engine search here: callers fetch `ScoredMove[]` from
 * `analyzePosition` (off-thread) and pass them in.
 *
 * Two ideas the engine doesn't give you directly:
 *
 *  1. A SIDE-NEUTRAL eval. `scoreMoves` returns scores from the perspective of
 *     the side to move (negamax form), which flips sign every ply and is unread-
 *     able across a game. `whiteEval` re-expresses any such score as "+ is good
 *     for White", so an eval bar reads consistently from move 1 to mate.
 *
 *  2. A move-QUALITY label. We compare the score of the move actually played to
 *     the best available score (both from the same side-to-move view, so the
 *     difference is an honest, sign-safe "centi-column" loss) and bucket it.
 *     Thresholds are in evaluation units where one column of control ≈ 100
 *     (see DEFAULT_WEIGHTS) — chosen to be reasonable, not match-tuned.
 */
import type { Move, PlayerColor, ScoredMove } from '../../src/index.ts';

/** Move-quality buckets, weakest play last. `forced` = no real choice existed. */
export type MoveQuality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced';

/** Short human label per quality, for badges and the ply note. */
export const QUALITY_LABEL: Record<MoveQuality, string> = {
  best: 'Best move',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  forced: 'Forced',
};

/** A glyph that reads without colour (badges are also colour-coded in CSS). */
export const QUALITY_GLYPH: Record<MoveQuality, string> = {
  best: '★',
  good: '✓',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
  forced: '·',
};

/**
 * Loss thresholds in evaluation units (one column of control ≈ 100). A move is
 * "good" if it gives up less than INACCURACY vs. the engine's pick, and so on.
 * Below GOOD_SLACK the move is treated as effectively best (ties / rounding).
 */
const GOOD_SLACK = 8;
const INACCURACY = 45;
const MISTAKE = 130;
const BLUNDER = 320;

/** Re-express a side-to-move score as a White-positive eval (+ = White better). */
export function whiteEval(scoreToMove: number, toMove: PlayerColor): number {
  return toMove === 'W' ? scoreToMove : -scoreToMove;
}

/** Does this scored entry correspond to `move`? Matches origin, destination and
 *  capture set (length), tolerant of capture-chain ordering like rebuildGame. */
function sameMove(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && a.captures.length === b.captures.length;
}

export interface MoveReview {
  quality: MoveQuality;
  /** Evaluation units given up vs. the engine's best move (≥ 0). */
  loss: number;
  /** The engine's preferred move, when it differs from the one played. */
  best: Move | null;
}

/**
 * Classify the move actually played from a position, given every legal move
 * scored from that position (best first). Returns `forced` when there was only
 * one legal move, and falls back to `best` if the played move can't be located
 * in the list (shouldn't happen for a legally rebuilt game).
 */
export function reviewMove(played: Move, scored: ScoredMove[]): MoveReview {
  if (scored.length <= 1) return { quality: 'forced', loss: 0, best: null };

  const bestScore = scored[0]!.score;
  const bestMove = scored[0]!.move;
  const playedEntry = scored.find((s) => sameMove(s.move, played));
  if (!playedEntry) return { quality: 'best', loss: 0, best: null };

  const loss = Math.max(0, bestScore - playedEntry.score);
  const isBest = sameMove(playedEntry.move, bestMove) || loss <= GOOD_SLACK;
  const best = isBest ? null : bestMove;

  let quality: MoveQuality;
  if (isBest) quality = 'best';
  else if (loss < INACCURACY) quality = 'good';
  else if (loss < MISTAKE) quality = 'inaccuracy';
  else if (loss < BLUNDER) quality = 'mistake';
  else quality = 'blunder';

  return { quality, loss, best };
}

/** Format a White-positive eval for display, e.g. "+1.4" / "−0.3" (in columns). */
export function formatEval(white: number): string {
  const columns = white / 100;
  const sign = columns > 0 ? '+' : columns < 0 ? '−' : '';
  return `${sign}${Math.abs(columns).toFixed(1)}`;
}
