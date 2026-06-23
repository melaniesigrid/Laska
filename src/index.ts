/**
 * Laska (Lasca) rules engine — public API.
 *
 * This module is the single source of truth for game logic. It is pure and has
 * no UI, networking, or platform dependencies, so the same code can run on a
 * client (for responsive/optimistic play) and on an authoritative server.
 */

export type {
  PlayerColor,
  Rank,
  Piece,
  Column,
  Board,
  Move,
  GameState,
  GameOutcome,
} from './types.ts';

export {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  controlledSquares,
  commander,
  opponent,
  DEFAULT_NO_PROGRESS_PLY_LIMIT,
  type StatusOptions,
} from './rules.ts';

export { encodePosition, decodePosition } from './notation.ts';

export {
  chooseMove,
  scoreMoves,
  evaluate,
  newStats,
  DEFAULT_WEIGHTS,
  DIFFICULTY_DEPTH,
  DIFFICULTY_ORDER,
  type Difficulty,
  type AIOptions,
  type EvalWeights,
  type ScoredMove,
  type ScoreOptions,
  type SearchStats,
} from './ai.ts';

export {
  SQUARE_TO_RC,
  RC_TO_SQUARE,
  NUM_SQUARES,
  BOARD_DIM,
  WHITE_HOME_SQUARES,
  BLACK_HOME_SQUARES,
  isPromotionSquare,
  step,
} from './board.ts';
