/**
 * Laska (Lasca) rules engine — pure functions over immutable state.
 *
 * Public surface:
 *   createInitialState()        -> GameState
 *   legalMoves(state)           -> Move[]
 *   applyMove(state, move)      -> GameState   (does not mutate input)
 *   gameStatus(state, opts?)    -> GameOutcome
 *
 * VERIFIED RULES (see src/types.ts header for sources):
 *  - 7x7 board, 25 playing squares; 11 soldiers each on the 3 nearest rows;
 *    centre row empty; White moves first.
 *  - A column is controlled by its top piece (commander). Soldier-topped
 *    columns move/capture forward only; officer-topped columns, both ways.
 *  - Capture: jump an adjacent enemy-controlled square to the empty square
 *    beyond. Only the TOP piece of the jumped column is taken; it is placed at
 *    the BOTTOM of the capturing column. The rest of the jumped column stays
 *    put and may now be controlled by a different colour.
 *  - Capturing is mandatory; a capture must be continued by the same piece
 *    until no further capture is possible — EXCEPT that if a soldier-topped
 *    column lands on the back rank, it is crowned and the move ends immediately
 *    (promotion ends the move, even mid-chain).
 *  - A player may choose freely among available captures (no maximum-capture
 *    rule). Only the commander is promoted; pieces beneath are unaffected.
 *  - Win: opponent has no controlled pieces, or no legal move, or resigns.
 *  - Draw (DESIGNED for this app, see README): threefold repetition, mutual
 *    agreement, and a configurable no-progress counter.
 */

import type { Board, Column, GameOutcome, GameState, Move, Piece, PlayerColor } from './types.ts';
import {
  ALL_DIRECTIONS,
  FORWARD_DIRECTIONS,
  NUM_SQUARES,
  WHITE_HOME_SQUARES,
  BLACK_HOME_SQUARES,
  isPromotionSquare,
  step,
  type Direction,
} from './board.ts';
import { encodePosition } from './notation.ts';

/** Default threshold for the no-progress draw rule, in plies (half-moves). */
export const DEFAULT_NO_PROGRESS_PLY_LIMIT = 40;

// --------------------------------------------------------------------------
// Small helpers
// --------------------------------------------------------------------------

export function opponent(color: PlayerColor): PlayerColor {
  return color === 'W' ? 'B' : 'W';
}

/** The top piece (commander) of a column, or null for an empty/missing column. */
export function commander(col: Column | null): Piece | null {
  if (!col || col.length === 0) return null;
  return col[col.length - 1]!;
}

function controlledBy(col: Column | null, color: PlayerColor): boolean {
  const c = commander(col);
  return c !== null && c.color === color;
}

function cloneColumn(col: Column): Column {
  return col.map((p) => ({ color: p.color, rank: p.rank }));
}

function cloneBoard(board: Board): Board {
  return board.map((col) => (col ? cloneColumn(col) : null));
}

/** Allowed step directions for whatever sits on top of `col`. */
function directionsFor(col: Column): Direction[] {
  const c = commander(col)!;
  return c.rank === 'officer' ? ALL_DIRECTIONS : FORWARD_DIRECTIONS[c.color];
}

/** Square indices currently controlled by `color`. */
export function controlledSquares(board: Board, color: PlayerColor): number[] {
  const out: number[] = [];
  for (let i = 0; i < NUM_SQUARES; i++) {
    if (controlledBy(board[i] ?? null, color)) out.push(i);
  }
  return out;
}

// --------------------------------------------------------------------------
// Initial position
// --------------------------------------------------------------------------

export function createInitialState(): GameState {
  const board: Board = new Array(NUM_SQUARES).fill(null);
  for (const sq of WHITE_HOME_SQUARES) board[sq] = [{ color: 'W', rank: 'soldier' }];
  for (const sq of BLACK_HOME_SQUARES) board[sq] = [{ color: 'B', rank: 'soldier' }];

  const toMove: PlayerColor = 'W';
  const key = encodePosition({ board, toMove });
  return {
    board,
    toMove,
    plyNoProgress: 0,
    positionCounts: { [key]: 1 },
  };
}

// --------------------------------------------------------------------------
// Move generation
// --------------------------------------------------------------------------

/** Non-capture moves for the column on `square` (assumed controlled by `color`). */
function quietMovesFrom(board: Board, square: number, color: PlayerColor): Move[] {
  const col = board[square]!;
  const moves: Move[] = [];
  for (const dir of directionsFor(col)) {
    const dest = step(square, dir);
    if (dest === -1) continue;
    if (board[dest] !== null) continue; // must be vacant
    const isSoldierTop = commander(col)!.rank === 'soldier';
    const promotion = isSoldierTop && isPromotionSquare(color, dest);
    moves.push({
      from: square,
      to: dest,
      path: [dest],
      captures: [],
      isCapture: false,
      promotion,
    });
  }
  return moves;
}

/**
 * All maximal capture sequences for the column on `square`.
 *
 * Implemented as a depth-first search over a *mutated working copy* of the
 * board, because each jump changes the board before the next jump is decided
 * (the jumped piece is removed from its square and buried in the moving column).
 *
 * Termination: every jump removes exactly one enemy piece from the board
 * surface and buries it at the bottom of the moving column, where it cannot be
 * jumped again this turn. The number of enemy pieces is finite, so the chain
 * length is bounded. (A defensive depth cap is also applied.)
 */
function captureSequencesFrom(board: Board, square: number, color: PlayerColor): Move[] {
  const results: Move[] = [];
  const MAX_DEPTH = NUM_SQUARES * 2; // far beyond any real chain

  function dfs(
    work: Board,
    cur: number,
    movingCol: Column,
    path: number[],
    captures: number[],
  ): void {
    if (path.length > MAX_DEPTH) {
      throw new Error('Capture search exceeded depth bound — logic error');
    }
    const dirs = directionsFor(movingCol);

    for (const dir of dirs) {
      const mid = step(cur, dir);
      if (mid === -1) continue;
      const midCol = work[mid] ?? null;
      if (!controlledBy(midCol, opponent(color))) continue; // must jump an enemy
      const landing = step(mid, dir);
      if (landing === -1) continue;
      if (work[landing] !== null) continue; // landing must be vacant

      // Perform the jump on a fresh copy so siblings are independent.
      const next = cloneBoard(work);
      const capturedTop = commander(midCol)!; // enemy commander taken
      const midStack = next[mid]!;
      next[mid] = midStack.length > 1 ? midStack.slice(0, -1) : null;
      next[cur] = null;
      // prisoner goes to the BOTTOM; commander on top is preserved
      const newMovingCol: Column = [{ color: capturedTop.color, rank: capturedTop.rank }, ...movingCol];
      next[landing] = newMovingCol;

      const newPath = [...path, landing];
      const newCaptures = [...captures, mid];

      // Promotion ends the move immediately, even if more jumps exist.
      const topIsSoldier = commander(newMovingCol)!.rank === 'soldier';
      if (topIsSoldier && isPromotionSquare(color, landing)) {
        results.push({
          from: square,
          to: landing,
          path: newPath,
          captures: newCaptures,
          isCapture: true,
          promotion: true,
        });
        continue;
      }

      // Otherwise the same piece must continue capturing if it can.
      const before = results.length;
      dfs(next, landing, newMovingCol, newPath, newCaptures);
      if (results.length === before) {
        // No further captures from here -> this is a completed sequence.
        results.push({
          from: square,
          to: landing,
          path: newPath,
          captures: newCaptures,
          isCapture: true,
          promotion: false,
        });
      }
    }
  }

  dfs(board, square, board[square]!, [], []);
  return results;
}

/**
 * All legal moves for the side to move.
 *
 * Mandatory-capture rule: if any capture exists anywhere, ONLY captures are
 * returned. Otherwise all non-capture moves are returned.
 */
export function legalMoves(state: GameState): Move[] {
  const { board, toMove } = state;
  const mySquares = controlledSquares(board, toMove);

  const captures: Move[] = [];
  for (const sq of mySquares) {
    const seqs = captureSequencesFrom(board, sq, toMove);
    for (const m of seqs) captures.push(m);
  }
  if (captures.length > 0) return captures;

  const quiet: Move[] = [];
  for (const sq of mySquares) {
    for (const m of quietMovesFrom(board, sq, toMove)) quiet.push(m);
  }
  return quiet;
}

// --------------------------------------------------------------------------
// Applying a move
// --------------------------------------------------------------------------

/**
 * Apply `move` to `state`, returning a NEW state (input is not mutated).
 *
 * The move is re-simulated from `from` + `path` rather than trusted blindly,
 * so an internally-inconsistent Move throws instead of corrupting the board.
 */
export function applyMove(state: GameState, move: Move): GameState {
  const board = cloneBoard(state.board);
  const color = state.toMove;

  const startCol = board[move.from];
  if (!startCol) throw new Error(`No column on square ${move.from} to move`);
  if (!controlledBy(startCol, color)) {
    throw new Error(`Square ${move.from} is not controlled by ${color}`);
  }
  const startedSoldierTopped = commander(startCol)!.rank === 'soldier';

  let movingCol: Column = cloneColumn(startCol);
  board[move.from] = null;

  if (!move.isCapture) {
    const dest = move.path[0];
    if (dest === undefined) throw new Error('Quiet move has empty path');
    if (board[dest] !== null) throw new Error(`Destination ${dest} is not vacant`);
    board[dest] = movingCol;
    maybePromote(board, dest, color);
  } else {
    let cur = move.from;
    for (let i = 0; i < move.path.length; i++) {
      const landing = move.path[i]!;
      const mid = move.captures[i];
      if (mid === undefined) throw new Error(`Capture step ${i}: missing captured square`);
      const midCol = board[mid] ?? null;
      if (!controlledBy(midCol, opponent(color))) {
        throw new Error(`Capture step ${i}: square ${mid} is not an enemy column`);
      }
      if (board[landing] !== null) {
        throw new Error(`Capture step ${i}: landing ${landing} is not vacant`);
      }
      const capturedTop = commander(midCol)!;
      const midStack = midCol!;
      board[mid] = midStack.length > 1 ? midStack.slice(0, -1) : null;
      movingCol = [{ color: capturedTop.color, rank: capturedTop.rank }, ...movingCol];
      cur = landing;
    }
    board[cur] = movingCol;
    maybePromote(board, cur, color);
  }

  // Progress = capture, or a soldier-topped (forward-only, irreversible) move,
  // or a promotion. King shuffles do not count as progress.
  const progressed = move.isCapture || startedSoldierTopped || move.promotion;

  const nextToMove = opponent(color);
  const key = encodePosition({ board, toMove: nextToMove });
  const positionCounts = { ...state.positionCounts };
  positionCounts[key] = (positionCounts[key] ?? 0) + 1;

  return {
    board,
    toMove: nextToMove,
    plyNoProgress: progressed ? 0 : state.plyNoProgress + 1,
    positionCounts,
  };
}

/** Crown the commander on `square` if a soldier of `color` reached its back rank. */
function maybePromote(board: Board, square: number, color: PlayerColor): void {
  const col = board[square];
  if (!col || col.length === 0) return;
  const top = col[col.length - 1]!;
  if (top.color === color && top.rank === 'soldier' && isPromotionSquare(color, square)) {
    col[col.length - 1] = { color, rank: 'officer' };
  }
}

// --------------------------------------------------------------------------
// Game status
// --------------------------------------------------------------------------

export interface StatusOptions {
  /** Plies without progress before a draw is declared. Default 40. */
  noProgressPlyLimit?: number;
}

export function gameStatus(state: GameState, opts: StatusOptions = {}): GameOutcome {
  const limit = opts.noProgressPlyLimit ?? DEFAULT_NO_PROGRESS_PLY_LIMIT;

  // Loss conditions take priority over draw conditions.
  const myPieces = controlledSquares(state.board, state.toMove);
  if (myPieces.length === 0) {
    return { state: 'win', winner: opponent(state.toMove), reason: 'no-pieces' };
  }
  const moves = legalMoves(state);
  if (moves.length === 0) {
    return { state: 'win', winner: opponent(state.toMove), reason: 'no-moves' };
  }

  const key = encodePosition({ board: state.board, toMove: state.toMove });
  if ((state.positionCounts[key] ?? 0) >= 3) {
    return { state: 'draw', reason: 'threefold-repetition' };
  }
  if (state.plyNoProgress >= limit) {
    return { state: 'draw', reason: 'no-progress' };
  }
  return { state: 'ongoing' };
}
