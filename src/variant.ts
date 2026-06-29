/**
 * Game variants — the one place every rules/geometry difference between Laska
 * and its ancestor Bashni lives as DATA, never as scattered `if (bashni)`
 * branches. The engine reads a `Variant` off the `GameState` (defaulting to
 * Laska) and behaves accordingly, so there is still exactly ONE engine.
 *
 * Two variants ship:
 *  - LASKA  — Emanuel Lasker's 1911 game: 7x7, 25 squares, 11 men a side; men
 *             move/capture forward only; a crowned man is a single-step officer;
 *             promotion ends the move immediately.
 *  - BASHNI — the Russian "towers" draughts Laska descends from: 8x8, 32 squares,
 *             12 men a side; men move forward but CAPTURE both ways; a crowned man
 *             is a FLYING king (Russian rules); a man that promotes mid-capture
 *             becomes a king and continues capturing.
 *
 * Stacking is identical in both: a captured commander is buried at the BOTTOM of
 * the capturing column (see rules.ts / types.ts).
 *
 * This module imports only `types.ts`, so it sits below board.ts/rules.ts in the
 * dependency graph; board.ts re-exports the Laska variant's tables under the
 * historical constant names (BOARD_DIM, NUM_SQUARES, SQUARE_TO_RC, ...).
 */

import type { PlayerColor } from './types.ts';

export type VariantId = 'laska' | 'bashni';
/** How a crowned column moves/captures: 'step' = single diagonal (Laska officer),
 *  'flying' = any distance along a diagonal (Bashni/Russian king). */
export type KingType = 'step' | 'flying';
/** Which directions an un-promoted man may CAPTURE in (it always moves quietly
 *  forward only). 'forward' = Laska, 'all' = Bashni/Russian (captures backward too). */
export type ManCaptureDirs = 'forward' | 'all';
/** What happens when a man reaches the back rank mid-capture: 'endMove' = Laska
 *  (crowning ends the move immediately); 'continue' = Bashni/Russian (the man
 *  crowns and, as a king, must keep capturing if it can). */
export type PromotionMidCapture = 'endMove' | 'continue';

export interface RC {
  row: number;
  col: number;
}

/** A diagonal step as a (dRow, dCol) unit vector. */
export type Direction = { dRow: number; dCol: number };

/** The four diagonal step directions. Universal — independent of board size. */
export const DIRECTIONS = {
  NE: { dRow: 1, dCol: 1 },
  NW: { dRow: 1, dCol: -1 },
  SE: { dRow: -1, dCol: 1 },
  SW: { dRow: -1, dCol: -1 },
} as const;

/** Forward directions for a soldier-topped column, by colour. */
export const FORWARD_DIRECTIONS: Record<PlayerColor, Direction[]> = {
  W: [DIRECTIONS.NE, DIRECTIONS.NW],
  B: [DIRECTIONS.SE, DIRECTIONS.SW],
};

/** Officers (and officer-topped columns) act in all four directions. */
export const ALL_DIRECTIONS: Direction[] = [
  DIRECTIONS.NE,
  DIRECTIONS.NW,
  DIRECTIONS.SE,
  DIRECTIONS.SW,
];

export interface Variant {
  id: VariantId;
  name: string;

  /** Side length of the square grid (7 = Laska, 8 = Bashni). */
  boardDim: number;
  /** Number of playing (dark) squares — board array length. */
  numSquares: number;

  /** Playing-square index -> (row, col). Length === numSquares. */
  squareToRc: RC[];
  /** (row, col) -> index, or -1 if not a playing square. Indexed [row*boardDim + col]. */
  rcToSquare: number[];

  /** The starting squares (3 nearest rows) for each colour's men. */
  homeSquares: Record<PlayerColor, number[]>;

  manCaptureDirs: ManCaptureDirs;
  kingType: KingType;
  promotionMidCapture: PromotionMidCapture;
}

/**
 * Build the dark-square geometry for a `boardDim`x`boardDim` grid. Playing
 * squares are those where (row + col) is even, indexed 0.. in row-major order —
 * the same convention for every variant.
 */
function buildGeometry(boardDim: number): { squareToRc: RC[]; rcToSquare: number[]; numSquares: number } {
  const squareToRc: RC[] = [];
  const rcToSquare: number[] = new Array(boardDim * boardDim).fill(-1);
  let idx = 0;
  for (let row = 0; row < boardDim; row++) {
    for (let col = 0; col < boardDim; col++) {
      if ((row + col) % 2 === 0) {
        squareToRc[idx] = { row, col };
        rcToSquare[row * boardDim + col] = idx;
        idx++;
      }
    }
  }
  return { squareToRc, rcToSquare, numSquares: idx };
}

/** The home squares (3 nearest rows) for `color` on a board of `squareToRc`. */
function homeRows(boardDim: number, color: PlayerColor, squareToRc: RC[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < squareToRc.length; i++) {
    const r = squareToRc[i]!.row;
    const isHome = color === 'W' ? r <= 2 : r >= boardDim - 3;
    if (isHome) out.push(i);
  }
  return out;
}

interface VariantConfig {
  id: VariantId;
  name: string;
  boardDim: number;
  manCaptureDirs: ManCaptureDirs;
  kingType: KingType;
  promotionMidCapture: PromotionMidCapture;
}

function makeVariant(cfg: VariantConfig): Variant {
  const { squareToRc, rcToSquare, numSquares } = buildGeometry(cfg.boardDim);
  return {
    ...cfg,
    squareToRc,
    rcToSquare,
    numSquares,
    homeSquares: {
      W: homeRows(cfg.boardDim, 'W', squareToRc),
      B: homeRows(cfg.boardDim, 'B', squareToRc),
    },
  };
}

export const LASKA: Variant = makeVariant({
  id: 'laska',
  name: 'Laska',
  boardDim: 7,
  manCaptureDirs: 'forward',
  kingType: 'step',
  promotionMidCapture: 'endMove',
});

export const BASHNI: Variant = makeVariant({
  id: 'bashni',
  name: 'Bashni',
  boardDim: 8,
  manCaptureDirs: 'all',
  kingType: 'flying',
  promotionMidCapture: 'continue',
});

export const VARIANTS: Record<VariantId, Variant> = { laska: LASKA, bashni: BASHNI };

/** The variant assumed when a GameState carries none (keeps Laska back-compat). */
export const DEFAULT_VARIANT: Variant = LASKA;

/** The variant a state plays under — Laska if unset. Structural, so it works on
 *  any `{ variant? }` (full GameState or a partial). */
export function variantOf(state: { variant?: Variant }): Variant {
  return state.variant ?? DEFAULT_VARIANT;
}

// --------------------------------------------------------------------------
// Variant-aware geometry helpers (board.ts exposes Laska-bound wrappers)
// --------------------------------------------------------------------------

/** One diagonal step from `square` in `dir` on `v`'s board, or -1 off-board. */
export function stepIn(v: Variant, square: number, dir: Direction): number {
  const rc = v.squareToRc[square];
  if (!rc) return -1;
  const r = rc.row + dir.dRow;
  const c = rc.col + dir.dCol;
  if (r < 0 || r >= v.boardDim || c < 0 || c >= v.boardDim) return -1;
  return v.rcToSquare[r * v.boardDim + c] ?? -1;
}

/** The promotion (back) rank row index for `color` on `v`. */
export function promotionRowIn(v: Variant, color: PlayerColor): number {
  return color === 'W' ? v.boardDim - 1 : 0;
}

/** True if landing on `square` crowns a man of `color` on `v`. */
export function isPromotionSquareIn(v: Variant, color: PlayerColor, square: number): boolean {
  const rc = v.squareToRc[square];
  return rc !== undefined && rc.row === promotionRowIn(v, color);
}
