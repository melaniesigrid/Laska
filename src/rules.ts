/**
 * Laska (Lasca) rules engine — pure functions over immutable state.
 *
 * Public surface:
 *   createInitialState()        -> GameState
 *   legalMoves(state)           -> Move[]
 *   applyMove(state, move)      -> GameState   (does not mutate input)
 *   gameStatus(state, opts?)    -> GameOutcome
 *
 * PRIMARY-SOURCE VALIDATION (2026-06-22): this engine replays Dr. Emanuel
 * Lasker's OWN explanatory games from his 1911 booklet "Rules of Lasca" end to
 * end — Game 2 (39 plies) and Game 3 (78 plies) validate move-for-move. That is
 * the strongest confirmation the rules below match the inventor's. The one
 * interpretive choice is capture selection: Lasker advised "the longest run or
 * best advantage"; the "or best advantage" makes this guidance, not a strict
 * maximum-capture rule, so we implement FREE CHOICE (the common modern reading).
 * See web/src/games.ts (replays) and BrochurePage (the canonical rules write-up).
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
  DEFAULT_VARIANT,
  variantOf,
  stepIn,
  isPromotionSquareIn,
  type Direction,
  type Variant,
} from './variant.ts';
import { encodePosition } from './notation.ts';

export { variantOf } from './variant.ts';

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

/**
 * Allowed directions for whatever sits on top of `col`, in a given `mode`.
 * Officers always act in all four directions. A man always MOVES quietly forward
 * only; whether it may CAPTURE backward is the per-variant `manCaptureDirs` flag
 * (Laska: forward only; Bashni/Russian: all four).
 */
function directionsFor(v: Variant, col: Column, mode: 'move' | 'capture'): Direction[] {
  const c = commander(col)!;
  if (c.rank === 'officer') return ALL_DIRECTIONS;
  if (mode === 'capture' && v.manCaptureDirs === 'all') return ALL_DIRECTIONS;
  return FORWARD_DIRECTIONS[c.color];
}

/** Square indices currently controlled by `color`. */
export function controlledSquares(board: Board, color: PlayerColor): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (controlledBy(board[i] ?? null, color)) out.push(i);
  }
  return out;
}

// --------------------------------------------------------------------------
// Initial position
// --------------------------------------------------------------------------

export function createInitialState(variant: Variant = DEFAULT_VARIANT): GameState {
  const board: Board = new Array(variant.numSquares).fill(null);
  for (const sq of variant.homeSquares.W) board[sq] = [{ color: 'W', rank: 'soldier' }];
  for (const sq of variant.homeSquares.B) board[sq] = [{ color: 'B', rank: 'soldier' }];

  const toMove: PlayerColor = 'W';
  const key = encodePosition({ board, toMove });
  return {
    board,
    toMove,
    plyNoProgress: 0,
    positionCounts: { [key]: 1 },
    variant,
  };
}

// --------------------------------------------------------------------------
// Move generation
// --------------------------------------------------------------------------

/** Non-capture moves for the column on `square` (assumed controlled by `color`). */
function quietMovesFrom(v: Variant, board: Board, square: number, color: PlayerColor): Move[] {
  const col = board[square]!;
  const moves: Move[] = [];
  const isFlyingKing = commander(col)!.rank === 'officer' && v.kingType === 'flying';

  if (isFlyingKing) {
    // Flying king: glide any number of EMPTY squares along each diagonal, stopping
    // at the first occupied square or the board edge. Kings never promote.
    for (const dir of ALL_DIRECTIONS) {
      let dest = stepIn(v, square, dir);
      while (dest !== -1 && board[dest] === null) {
        moves.push({ from: square, to: dest, path: [dest], captures: [], isCapture: false, promotion: false });
        dest = stepIn(v, dest, dir);
      }
    }
    return moves;
  }

  // Single-step move (a man, or a Laska step-officer): exactly one diagonal.
  for (const dir of directionsFor(v, col, 'move')) {
    const dest = stepIn(v, square, dir);
    if (dest === -1) continue;
    if (board[dest] !== null) continue; // must be vacant
    const isSoldierTop = commander(col)!.rank === 'soldier';
    const promotion = isSoldierTop && isPromotionSquareIn(v, color, dest);
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
function captureSequencesFrom(v: Variant, board: Board, square: number, color: PlayerColor): Move[] {
  const results: Move[] = [];
  const MAX_DEPTH = v.numSquares * 2; // far beyond any real chain

  // Perform one jump (over `midSq`, landing on `landing`) on a fresh board copy,
  // then either end the move (promotion in a 'endMove' variant) or recurse to
  // continue the mandatory capture. Shared by step and flying jumps — only the
  // (midSq, landing) candidate generation in `dfs` differs.
  function emitJump(
    work: Board,
    cur: number,
    midSq: number,
    landing: number,
    movingCol: Column,
    path: number[],
    captures: number[],
    promoted: boolean,
  ): void {
    const next = cloneBoard(work);
    const capturedTop = commander(next[midSq] ?? null)!; // enemy commander taken
    const midStack = next[midSq]!;
    next[midSq] = midStack.length > 1 ? midStack.slice(0, -1) : null;
    next[cur] = null;
    // prisoner goes to the BOTTOM; commander on top is preserved
    let newMovingCol: Column = [{ color: capturedTop.color, rank: capturedTop.rank }, ...movingCol];
    next[landing] = newMovingCol;

    const newPath = [...path, landing];
    const newCaptures = [...captures, midSq];

    const topIsSoldier = commander(newMovingCol)!.rank === 'soldier';
    const crowns = topIsSoldier && isPromotionSquareIn(v, color, landing);

    if (crowns && v.promotionMidCapture === 'endMove') {
      // Laska: crowning ends the move immediately, even if more jumps exist.
      results.push({ from: square, to: landing, path: newPath, captures: newCaptures, isCapture: true, promotion: true });
      return;
    }

    if (crowns) {
      // Bashni/Russian: the man crowns NOW and continues the capture as a king
      // (a flying king, if the variant flies), so search the continuation crowned.
      newMovingCol = [...newMovingCol.slice(0, -1), { color, rank: 'officer' }];
      next[landing] = newMovingCol;
    }

    const promotedNow = promoted || crowns;

    // The same piece must continue capturing if it can.
    const before = results.length;
    dfs(next, landing, newMovingCol, newPath, newCaptures, promotedNow);
    if (results.length === before) {
      // No further captures from here -> this is a completed sequence. `promotion`
      // is true if the column crowned at ANY point during the chain.
      results.push({ from: square, to: landing, path: newPath, captures: newCaptures, isCapture: true, promotion: promotedNow });
    }
  }

  function dfs(
    work: Board,
    cur: number,
    movingCol: Column,
    path: number[],
    captures: number[],
    promoted: boolean,
  ): void {
    if (path.length > MAX_DEPTH) {
      throw new Error('Capture search exceeded depth bound — logic error');
    }
    const isFlying = commander(movingCol)!.rank === 'officer' && v.kingType === 'flying';
    const dirs = directionsFor(v, movingCol, 'capture');

    for (const dir of dirs) {
      if (!isFlying) {
        // Step jump: an adjacent enemy, landing on the square just beyond it.
        const mid = stepIn(v, cur, dir);
        if (mid === -1) continue;
        if (!controlledBy(work[mid] ?? null, opponent(color))) continue; // must jump an enemy
        const landing = stepIn(v, mid, dir);
        if (landing === -1) continue;
        if (work[landing] !== null) continue; // landing must be vacant
        emitJump(work, cur, mid, landing, movingCol, path, captures, promoted);
      } else {
        // Flying jump: scan along the diagonal to the FIRST occupied square; it
        // must be an enemy column with an empty square immediately beyond, and
        // the king may then land on ANY empty square past it (one branch each).
        let scan = stepIn(v, cur, dir);
        while (scan !== -1 && work[scan] === null) scan = stepIn(v, scan, dir);
        if (scan === -1) continue; // ran off the board with no victim
        if (!controlledBy(work[scan] ?? null, opponent(color))) continue; // blocked by a non-enemy
        let landing = stepIn(v, scan, dir);
        while (landing !== -1 && work[landing] === null) {
          emitJump(work, cur, scan, landing, movingCol, path, captures, promoted);
          landing = stepIn(v, landing, dir);
        }
      }
    }
  }

  dfs(board, square, board[square]!, [], [], false);
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
  const v = variantOf(state);
  const mySquares = controlledSquares(board, toMove);

  const captures: Move[] = [];
  for (const sq of mySquares) {
    const seqs = captureSequencesFrom(v, board, sq, toMove);
    for (const m of seqs) captures.push(m);
  }
  if (captures.length > 0) return captures;

  const quiet: Move[] = [];
  for (const sq of mySquares) {
    for (const m of quietMovesFrom(v, board, sq, toMove)) quiet.push(m);
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
  const v = variantOf(state);
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
    maybePromote(v, board, dest, color);
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
      // A man that lands on its back rank crowns at once. In a 'continue' variant
      // (Bashni) this happens MID-chain, so the remainder flies as a king; in
      // 'endMove' (Laska) the generated chain has already ended on this landing.
      const movTop = movingCol[movingCol.length - 1]!;
      if (movTop.rank === 'soldier' && movTop.color === color && isPromotionSquareIn(v, color, landing)) {
        movingCol[movingCol.length - 1] = { color, rank: 'officer' };
      }
      cur = landing;
    }
    board[cur] = movingCol;
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
    ...(state.variant ? { variant: state.variant } : {}),
  };
}

/**
 * The sequence of board snapshots a move passes through, one entry per step in
 * `move.path` — so length 1 for a quiet move, and one per jump for a capture.
 * Snapshot `i` is the full board immediately AFTER the i-th step: the moving
 * column sits on `move.path[i]` and every prisoner taken up to and including
 * that jump has been buried. Promotion is applied only on the final landing,
 * exactly as `applyMove` does. Pure — the input state is not mutated, and the
 * last element equals `applyMove(state, move).board`.
 *
 * This exists so a UI can play a multi-jump capture out hop-by-hop — animating
 * the computer's chain one leap at a time, or letting a human click each jump —
 * while still deferring to THIS engine for the board after every jump rather
 * than re-deriving capture mechanics outside `src/`.
 */
export function moveStepBoards(state: GameState, move: Move): Board[] {
  const v = variantOf(state);
  const color = state.toMove;
  const working = cloneBoard(state.board);

  const startCol = working[move.from];
  if (!startCol) throw new Error(`No column on square ${move.from} to move`);
  if (!controlledBy(startCol, color)) {
    throw new Error(`Square ${move.from} is not controlled by ${color}`);
  }
  let movingCol: Column = cloneColumn(startCol);
  working[move.from] = null;

  const snapshots: Board[] = [];

  if (!move.isCapture) {
    const dest = move.path[0];
    if (dest === undefined) throw new Error('Quiet move has empty path');
    const board = cloneBoard(working);
    board[dest] = movingCol;
    maybePromote(v, board, dest, color);
    snapshots.push(board);
    return snapshots;
  }

  // The moving column is carried "in hand" (intermediate landings stay vacant in
  // `working`); each snapshot drops a copy of it onto that step's landing square.
  for (let i = 0; i < move.path.length; i++) {
    const landing = move.path[i]!;
    const mid = move.captures[i];
    if (mid === undefined) throw new Error(`Capture step ${i}: missing captured square`);
    const midCol = working[mid] ?? null;
    if (!controlledBy(midCol, opponent(color))) {
      throw new Error(`Capture step ${i}: square ${mid} is not an enemy column`);
    }
    const capturedTop = commander(midCol)!;
    const midStack = midCol!;
    working[mid] = midStack.length > 1 ? midStack.slice(0, -1) : null;
    movingCol = [{ color: capturedTop.color, rank: capturedTop.rank }, ...movingCol];
    // Crown mid-chain (Bashni 'continue') or on the last landing (Laska 'endMove'),
    // so every snapshot shows the correct rank — matching applyMove's re-simulation.
    const movTop = movingCol[movingCol.length - 1]!;
    if (movTop.rank === 'soldier' && movTop.color === color && isPromotionSquareIn(v, color, landing)) {
      movingCol[movingCol.length - 1] = { color, rank: 'officer' };
    }

    const board = cloneBoard(working);
    board[landing] = cloneColumn(movingCol);
    snapshots.push(board);
  }
  return snapshots;
}

/** Crown the commander on `square` if a soldier of `color` reached its back rank. */
function maybePromote(v: Variant, board: Board, square: number, color: PlayerColor): void {
  const col = board[square];
  if (!col || col.length === 0) return;
  const top = col[col.length - 1]!;
  if (top.color === color && top.rank === 'soldier' && isPromotionSquareIn(v, color, square)) {
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
