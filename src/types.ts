/**
 * Core types for the Laska (Lasca) rules engine.
 *
 * Rule sources verified before implementation:
 *  - Wikipedia "Lasca": https://en.wikipedia.org/wiki/Lasca
 *  - MindSports detailed ruleset (Christian Freeling): https://mindsports.nl/index.php/the-pit/609-lasca
 *  - lidraughts / community summaries of Lasker's original rules
 *
 * The board is a 7x7 grid; play occurs only on the 25 squares where (row + col)
 * is even. Those 25 squares are indexed 0..24, row-major (see board.ts).
 */

/** The two players. White ('W') moves first, per Lasker's rules. */
export type PlayerColor = 'W' | 'B';

/** A piece is either an un-promoted soldier (man) or a promoted officer (king). */
export type Rank = 'soldier' | 'officer';

export interface Piece {
  color: PlayerColor;
  rank: Rank;
}

/**
 * A column (stack) of one or more pieces occupying a single playing square.
 * Stored BOTTOM-FIRST: index 0 is the bottom prisoner, the LAST element is the
 * top piece, i.e. the "commander" that controls the column's colour, movement
 * and capture abilities. A single lone piece is just a column of length 1.
 *
 * Captured pieces are inserted at index 0 (the bottom), so the commander on top
 * is never displaced by a capture — exactly matching "prisoners under a cap".
 */
export type Column = Piece[];

/** Board state: 25 entries, one per playing square. `null` means empty. */
export type Board = (Column | null)[];

/**
 * A fully-specified, legal move produced by `legalMoves`.
 *
 * For a non-capture move: `path` is `[to]`, `captures` is `[]`.
 * For a capture: `path` lists the landing square after each jump in order, and
 * `captures[i]` is the square jumped over to reach `path[i]`. The jump that
 * reaches `path[i]` departs from `from` (when i === 0) or `path[i-1]` otherwise.
 */
export interface Move {
  from: number;
  to: number;
  path: number[];
  captures: number[];
  isCapture: boolean;
  /** True if this move ends with a soldier being crowned to officer. */
  promotion: boolean;
}

export type GameOutcome =
  | { state: 'ongoing' }
  | { state: 'win'; winner: PlayerColor; reason: 'no-pieces' | 'no-moves' | 'resignation' }
  | { state: 'draw'; reason: 'threefold-repetition' | 'no-progress' | 'agreement' };

/**
 * Selectable rule variants for the one genuinely contested point in the engine:
 * whether an officer (king) may jump OVER the same square more than once in a
 * single capture turn.
 *
 *  - 'lasker-classic' (DEFAULT): ALLOW same-square re-jumps. This is the engine's
 *    historical behaviour and the basis on which Lasker's 1911 games replay. A
 *    two-deep enemy stack can legally be jumped twice (its top piece is taken on
 *    the first jump, leaving an enemy commander that may be jumped again).
 *  - 'nestor-strict': FORBID jumping the same mid-square twice in one turn, per
 *    Néstor Romeral Andrés' 2018 nestorgames Lasca rulebook ("...but not jumping
 *    over the same space more than once").
 *
 * This is the ONLY behavioural knob in the rules engine; everything else is
 * fixed by Lasker's original rules.
 */
export type RuleVariant = 'lasker-classic' | 'nestor-strict';

/** Resolved rule options threaded through move generation / application. */
export interface RuleOptions {
  /** Whether the same mid-square may be jumped more than once per capture turn. */
  sameSquareReJump: 'allow' | 'forbid';
}

/** The engine default: Lasker-classic behaviour (same-square re-jumps allowed). */
export const DEFAULT_RULES: RuleOptions = { sameSquareReJump: 'allow' };

/**
 * Map a friendly variant name to the resolved {@link RuleOptions}. The web and
 * server layers select a variant by name and pass the result into `legalMoves`
 * / `applyMove` / `gameStatus`.
 */
export function rulesForVariant(v: RuleVariant): RuleOptions {
  switch (v) {
    case 'lasker-classic':
      return { sameSquareReJump: 'allow' };
    case 'nestor-strict':
      return { sameSquareReJump: 'forbid' };
  }
}

export interface GameState {
  board: Board;
  /** Whose turn it is. */
  toMove: PlayerColor;
  /**
   * Plies since the last "progress" event. Progress = any capture, any move of
   * a soldier-topped column (soldiers only move forward, so such moves are
   * irreversible), or a promotion. Used by the configurable no-progress draw
   * rule. See README — the threshold is a DESIGN choice, not an official rule.
   */
  plyNoProgress: number;
  /**
   * Count of how many times each position (board + side-to-move) has occurred,
   * keyed by `encodePosition`. Used for the threefold-repetition draw rule.
   */
  positionCounts: Record<string, number>;
}
