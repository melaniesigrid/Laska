/**
 * Compact, FEN-like position notation for Laska.
 *
 * Format:  <toMove>:<sq>=<stack>,<sq>=<stack>,...
 *   - toMove : 'W' or 'B'
 *   - sq     : square index 0..24
 *   - stack  : pieces BOTTOM->TOP, each a 2-char code:
 *                colour  'W' | 'B'
 *                rank    's' (soldier) | 'o' (officer)
 *              e.g. "WsBo" = bottom White soldier, top Black officer
 *   - squares are separated by ','
 *
 * `encodePosition` always lists occupied squares in ascending index order, so
 * the string is canonical and can be used directly as a repetition key. An
 * empty board for White to move encodes as "W:".
 *
 * NOTE ON SCOPE: this encodes a *position*, which is what you transmit for live
 * play and what threefold-repetition compares. Full game replay (a move list /
 * PDN-style transcript) is a deliberate follow-up, not implemented in this
 * milestone.
 */

import type { Board, Column, GameState, Piece, PlayerColor, Rank } from './types.ts';
import { NUM_SQUARES } from './board.ts';

function pieceToCode(p: Piece): string {
  return (p.color === 'W' ? 'W' : 'B') + (p.rank === 'soldier' ? 's' : 'o');
}

function codeToPiece(code: string): Piece {
  const c = code[0];
  const r = code[1];
  if (c !== 'W' && c !== 'B') {
    throw new Error(`Invalid piece colour "${c}" in code "${code}"`);
  }
  if (r !== 's' && r !== 'o') {
    throw new Error(`Invalid piece rank "${r}" in code "${code}"`);
  }
  const color: PlayerColor = c;
  const rank: Rank = r === 's' ? 'soldier' : 'officer';
  return { color, rank };
}

function stackToString(col: Column): string {
  return col.map(pieceToCode).join('');
}

function stringToStack(s: string): Column {
  const out: Column = [];
  for (let i = 0; i < s.length; i += 2) {
    out.push(codeToPiece(s.slice(i, i + 2)));
  }
  return out;
}

/** Encode just the board + side to move (canonical; used as repetition key). */
export function encodePosition(state: Pick<GameState, 'board' | 'toMove'>): string {
  const parts: string[] = [];
  for (let i = 0; i < NUM_SQUARES; i++) {
    const col = state.board[i];
    if (col && col.length > 0) {
      parts.push(`${i}=${stackToString(col)}`);
    }
  }
  return `${state.toMove}:${parts.join(',')}`;
}

/** Parse a position string into a fresh board + side to move. */
export function decodePosition(str: string): { board: Board; toMove: PlayerColor } {
  const colonIdx = str.indexOf(':');
  if (colonIdx === -1) throw new Error(`Invalid position string (missing ':'): ${str}`);
  const toMoveRaw = str.slice(0, colonIdx).trim();
  if (toMoveRaw !== 'W' && toMoveRaw !== 'B') {
    throw new Error(`Invalid side to move "${toMoveRaw}" in: ${str}`);
  }
  const toMove: PlayerColor = toMoveRaw;
  const board: Board = new Array(NUM_SQUARES).fill(null);

  const body = str.slice(colonIdx + 1).trim();
  if (body.length > 0) {
    for (const token of body.split(',')) {
      const eq = token.indexOf('=');
      if (eq === -1) throw new Error(`Invalid square token "${token}" in: ${str}`);
      const sq = Number(token.slice(0, eq));
      const stack = token.slice(eq + 1);
      if (!Number.isInteger(sq) || sq < 0 || sq >= NUM_SQUARES) {
        throw new Error(`Square index out of range: ${sq}`);
      }
      if (stack.length === 0 || stack.length % 2 !== 0) {
        throw new Error(`Invalid stack "${stack}" for square ${sq}`);
      }
      board[sq] = stringToStack(stack);
    }
  }
  return { board, toMove };
}
