/**
 * Board geometry for Laska.
 *
 * 7x7 grid. Playing squares are those where (row + col) is even — 25 of them.
 * They are indexed 0..24 in row-major order:
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
 */

import type { PlayerColor } from './types.ts';

export const BOARD_DIM = 7;
export const NUM_SQUARES = 25;

export interface RC {
  row: number;
  col: number;
}

/** index -> (row, col) */
export const SQUARE_TO_RC: RC[] = [];
/** (row, col) -> index, or -1 if not a playing square. Indexed as [row*7 + col]. */
export const RC_TO_SQUARE: number[] = new Array(BOARD_DIM * BOARD_DIM).fill(-1);

(function buildGeometry() {
  let idx = 0;
  for (let row = 0; row < BOARD_DIM; row++) {
    for (let col = 0; col < BOARD_DIM; col++) {
      if ((row + col) % 2 === 0) {
        SQUARE_TO_RC[idx] = { row, col };
        RC_TO_SQUARE[row * BOARD_DIM + col] = idx;
        idx++;
      }
    }
  }
})();

/** The four diagonal step directions as (dRow, dCol). */
export const DIRECTIONS = {
  NE: { dRow: 1, dCol: 1 },
  NW: { dRow: 1, dCol: -1 },
  SE: { dRow: -1, dCol: 1 },
  SW: { dRow: -1, dCol: -1 },
} as const;

export type Direction = { dRow: number; dCol: number };

/** Forward directions for a soldier-topped column, by colour. */
export const FORWARD_DIRECTIONS: Record<PlayerColor, Direction[]> = {
  W: [DIRECTIONS.NE, DIRECTIONS.NW],
  B: [DIRECTIONS.SE, DIRECTIONS.SW],
};

/** Officers (and officer-topped columns) move in all four directions. */
export const ALL_DIRECTIONS: Direction[] = [
  DIRECTIONS.NE,
  DIRECTIONS.NW,
  DIRECTIONS.SE,
  DIRECTIONS.SW,
];

/**
 * The square index reached by stepping one diagonal from `square` in `dir`,
 * or -1 if that would leave the board.
 */
export function step(square: number, dir: Direction): number {
  const rc = SQUARE_TO_RC[square];
  if (!rc) return -1; // out-of-range square index
  const r = rc.row + dir.dRow;
  const c = rc.col + dir.dCol;
  if (r < 0 || r >= BOARD_DIM || c < 0 || c >= BOARD_DIM) return -1;
  return RC_TO_SQUARE[r * BOARD_DIM + c] ?? -1;
}

/** Promotion (back) rank row index for a given colour. */
export function promotionRow(color: PlayerColor): number {
  return color === 'W' ? BOARD_DIM - 1 : 0;
}

/** True if landing on `square` promotes a soldier of the given colour. */
export function isPromotionSquare(color: PlayerColor, square: number): boolean {
  const rc = SQUARE_TO_RC[square];
  return rc !== undefined && rc.row === promotionRow(color);
}

/** Square indices forming each player's home rows (3 rows nearest them). */
export const WHITE_HOME_SQUARES: number[] = SQUARE_TO_RC.map((rc, i) => (rc.row <= 2 ? i : -1)).filter(
  (i) => i >= 0,
);
export const BLACK_HOME_SQUARES: number[] = SQUARE_TO_RC.map((rc, i) => (rc.row >= 4 ? i : -1)).filter(
  (i) => i >= 0,
);
