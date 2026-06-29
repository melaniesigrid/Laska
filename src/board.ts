/**
 * Board geometry for Laska — now a thin, backward-compatible surface over the
 * Laska variant defined in `variant.ts`. These module constants ARE the Laska
 * variant's geometry, so the ~dozen web files that import BOARD_DIM / NUM_SQUARES
 * / SQUARE_TO_RC / RC_TO_SQUARE / the home squares keep working unchanged (they
 * are, correctly, Laska-only content).
 *
 * 7x7 grid. Playing squares are those where (row + col) is even — 25 of them,
 * indexed 0..24 in row-major order:
 *
 *   row 0:  0   1   2   3        (cols 0,2,4,6)
 *   row 1:    4   5   6          (cols 1,3,5)
 *   row 2:  7   8   9  10        (cols 0,2,4,6)
 *   row 3:   11  12  13          (cols 1,3,5)   <- empty at start
 *   row 4: 14  15  16  17        (cols 0,2,4,6)
 *   row 5:   18  19  20          (cols 1,3,5)
 *   row 6: 21  22  23  24        (cols 0,2,4,6)
 *
 * White starts on rows 0-2 (indices 0..10) and moves towards higher rows.
 * Black starts on rows 4-6 (indices 14..24) and moves towards lower rows.
 * White promotes on row 6; Black promotes on row 0.
 *
 * For variant-parameterized geometry (e.g. Bashni's 8x8) use `variant.ts`
 * directly: `stepIn`, `isPromotionSquareIn`, `promotionRowIn`, and the per-variant
 * `squareToRc` / `rcToSquare` tables.
 */

import type { PlayerColor } from './types.ts';
import {
  LASKA,
  stepIn,
  isPromotionSquareIn,
  promotionRowIn,
  type Direction,
  type RC,
} from './variant.ts';

export {
  DIRECTIONS,
  FORWARD_DIRECTIONS,
  ALL_DIRECTIONS,
  type Direction,
  type RC,
} from './variant.ts';

export const BOARD_DIM = LASKA.boardDim;
export const NUM_SQUARES = LASKA.numSquares;

/** index -> (row, col) for the Laska board. */
export const SQUARE_TO_RC: RC[] = LASKA.squareToRc;
/** (row, col) -> index for the Laska board, or -1 if not a playing square. */
export const RC_TO_SQUARE: number[] = LASKA.rcToSquare;

/**
 * The square index reached by stepping one diagonal from `square` in `dir` on
 * the Laska board, or -1 if that would leave the board.
 */
export function step(square: number, dir: Direction): number {
  return stepIn(LASKA, square, dir);
}

/** Promotion (back) rank row index for a given colour on the Laska board. */
export function promotionRow(color: PlayerColor): number {
  return promotionRowIn(LASKA, color);
}

/** True if landing on `square` promotes a soldier of the given colour (Laska). */
export function isPromotionSquare(color: PlayerColor, square: number): boolean {
  return isPromotionSquareIn(LASKA, color, square);
}

/** Square indices forming each player's home rows (3 rows nearest them). */
export const WHITE_HOME_SQUARES: number[] = LASKA.homeSquares.W;
export const BLACK_HOME_SQUARES: number[] = LASKA.homeSquares.B;
