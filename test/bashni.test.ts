/**
 * Tests for the Bashni variant — the Russian "towers" draughts Laska descends
 * from. Bashni shares Laska's stacking but differs in: an 8x8 / 32-square board
 * with 12 men a side; men capture in all four directions (not just forward);
 * crowned pieces are FLYING kings; and a man that promotes mid-capture continues
 * the capture as a king.
 *
 * Run with:  node --test test/bashni.test.ts   (Node >= 22, native TS type-strip)
 *
 * Board geometry (dark squares where (row+col) is even, indexed row-major):
 *   row 0:  0   1   2   3       (cols 0,2,4,6)
 *   row 1:    4   5   6   7     (cols 1,3,5,7)
 *   row 2:  8   9  10  11       (cols 0,2,4,6)
 *   row 3:   12  13  14  15     (cols 1,3,5,7)   <- empty at start
 *   row 4: 16  17  18  19       (cols 0,2,4,6)   <- empty at start
 *   row 5:   20  21  22  23     (cols 1,3,5,7)
 *   row 6: 24  25  26  27       (cols 0,2,4,6)
 *   row 7:   28  29  30  31     (cols 1,3,5,7)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  controlledSquares,
  commander,
} from '../src/rules.ts';
import { chooseMove, evaluate } from '../src/ai.ts';
import { encodePosition, decodePosition } from '../src/notation.ts';
import { BASHNI, LASKA } from '../src/variant.ts';
import { NUM_SQUARES, SQUARE_TO_RC } from '../src/board.ts';
import type { Board, GameState, Move } from '../src/types.ts';

// ---- helpers --------------------------------------------------------------

function buildState(position: string, plyNoProgress = 0): GameState {
  const { board, toMove, variant } = decodePosition(position, BASHNI);
  const key = encodePosition({ board, toMove });
  return { board, toMove, plyNoProgress, positionCounts: { [key]: 1 }, variant };
}

function countPieces(board: Board): number {
  return board.reduce((sum, col) => sum + (col ? col.length : 0), 0);
}

function toSet(nums: number[]): Set<number> {
  return new Set(nums);
}

function moveTo(moves: Move[], to: number): Move {
  const m = moves.find((mv) => mv.to === to);
  assert.ok(m, `expected a legal move landing on ${to}; got ${moves.map((x) => x.to).join(',')}`);
  return m!;
}

// ---- variant wiring -------------------------------------------------------

test('LASKA variant aliases the historical board constants exactly', () => {
  // board.ts now re-exports the Laska variant's tables, so the ~dozen web files
  // that import these keep behaving identically.
  assert.equal(LASKA.numSquares, NUM_SQUARES);
  assert.equal(LASKA.numSquares, 25);
  assert.equal(LASKA.squareToRc, SQUARE_TO_RC); // same reference
  assert.equal(BASHNI.numSquares, 32);
});

// ---- setup ----------------------------------------------------------------

test('Bashni initial position: 12 men each, two empty middle rows, 24 total', () => {
  const s = createInitialState(BASHNI);
  assert.equal(s.toMove, 'W');
  assert.equal(s.board.length, 32);
  assert.deepEqual(
    toSet(controlledSquares(s.board, 'W')),
    toSet([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  );
  assert.deepEqual(
    toSet(controlledSquares(s.board, 'B')),
    toSet([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]),
  );
  for (let sq = 12; sq <= 19; sq++) assert.equal(s.board[sq], null);
  assert.equal(countPieces(s.board), 24);
  for (const col of s.board) {
    if (col) for (const p of col) assert.equal(p.rank, 'soldier');
  }
});

// ---- flying king ----------------------------------------------------------

test('flying king slides any distance along every open diagonal', () => {
  // Lone White king on 18 = (4,4) on an otherwise empty board.
  const s = buildState('W:18=Wo');
  const moves = legalMoves(s);
  assert.ok(moves.every((m) => !m.isCapture));
  assert.deepEqual(
    toSet(moves.map((m) => m.to)),
    // NE: 22,27,31  NW: 21,25,28  SE: 14,11,7  SW: 13,9,4,0
    toSet([22, 27, 31, 21, 25, 28, 14, 11, 7, 13, 9, 4, 0]),
  );
});

test('flying king slide is truncated by the first occupied square', () => {
  // A friendly man on 31 = (7,7) blocks the NE ray past 27.
  const s = buildState('W:18=Wo,31=Ws');
  const kingMoves = legalMoves(s).filter((m) => m.from === 18);
  const ne = kingMoves.filter((m) => [22, 27, 31].includes(m.to)).map((m) => m.to);
  assert.deepEqual(toSet(ne), toSet([22, 27])); // 31 is occupied, ray stops there
});

test('flying king captures at range and may land on any square beyond the victim', () => {
  // King on 0 = (0,0); enemy man on 9 = (2,2) up the NE diagonal, 4 empty between.
  const s = buildState('W:0=Wo,9=Bs');
  const moves = legalMoves(s);
  assert.ok(moves.length > 0 && moves.every((m) => m.isCapture));
  assert.ok(moves.every((m) => m.captures.length === 1 && m.captures[0] === 9));
  assert.deepEqual(toSet(moves.map((m) => m.to)), toSet([13, 18, 22, 27, 31]));

  // Landing on 13 buries only the victim's top under the king.
  const after = applyMove(s, moveTo(moves, 13));
  assert.equal(after.board[9], null);
  assert.deepEqual(after.board[13], [
    { color: 'B', rank: 'soldier' },
    { color: 'W', rank: 'officer' },
  ]);
});

test('flying king cannot jump a victim that is backed up by an occupied square', () => {
  // Enemy on 9, with 13 (immediately beyond it on the NE ray) occupied -> no jump.
  const s = buildState('W:0=Wo,9=Bs,13=Bs');
  const moves = legalMoves(s);
  assert.ok(moves.every((m) => !m.isCapture), 'the blocked victim yields no capture');
});

test('flying king capture over a 2-deep column takes only the top and flips control', () => {
  // 9 holds [Ws (bottom), Bs (top)] -> Black-controlled. King on 0 jumps the top.
  const s = buildState('W:0=Wo,9=WsBs');
  const moves = legalMoves(s);
  const after = applyMove(s, moveTo(moves, 13));
  // Top Black soldier buried under the king; the buried White man is freed.
  assert.deepEqual(after.board[9], [{ color: 'W', rank: 'soldier' }]);
  assert.equal(commander(after.board[9] ?? null)!.color, 'W'); // control flipped
  assert.deepEqual(after.board[13], [
    { color: 'B', rank: 'soldier' },
    { color: 'W', rank: 'officer' },
  ]);
  assert.equal(countPieces(after.board), countPieces(s.board));
});

// ---- men: backward capture ------------------------------------------------

test('a Bashni man captures backward but still only MOVES forward', () => {
  // White man on 18 = (4,4); enemy on 13 = (3,3) is BEHIND it (toward White home).
  const cap = buildState('W:18=Ws,13=Bs');
  const capMoves = legalMoves(cap);
  assert.ok(capMoves.length === 1 && capMoves[0]!.isCapture);
  assert.deepEqual(capMoves[0]!.captures, [13]);
  assert.equal(capMoves[0]!.to, 9); // SW jump lands on (2,2) = 9

  // With no capture available, the same man may only move forward (NE/NW).
  const quiet = buildState('W:18=Ws');
  assert.deepEqual(toSet(legalMoves(quiet).map((m) => m.to)), toSet([21, 22]));
});

// ---- promotion mid-capture continues --------------------------------------

test('a man that promotes mid-capture keeps capturing as a flying king', () => {
  // White man on 20 = (5,1). Jump 25 = (6,2) -> land 29 = (7,3) crowning, then the
  // new king must continue, jumping 26 = (6,4) along the SE ray.
  const s = buildState('W:20=Ws,25=Bs,26=Bs');
  const moves = legalMoves(s);
  assert.ok(moves.length > 0 && moves.every((m) => m.isCapture));
  // Promotion did NOT end the move: both enemies are taken in one chain.
  assert.ok(moves.every((m) => m.captures.length === 2));
  assert.ok(moves.every((m) => toSet(m.captures).has(25) && toSet(m.captures).has(26)));
  assert.ok(moves.every((m) => m.path[0] === 29 && m.promotion));
  // Landing squares beyond the second victim along SE: 22, 19, 15.
  assert.deepEqual(toSet(moves.map((m) => m.to)), toSet([22, 19, 15]));

  const after = applyMove(s, moveTo(moves, 22));
  const top = commander(after.board[22] ?? null)!;
  assert.equal(top.rank, 'officer');
  assert.equal(top.color, 'W');
  assert.equal(after.board[22]!.length, 3); // two prisoners under the new king
  assert.equal(countPieces(after.board), 3);
});

// ---- notation -------------------------------------------------------------

test('notation round-trips on a 32-square board and enforces per-variant bounds', () => {
  const { board, toMove } = decodePosition('W:31=Wo,0=Bs', BASHNI);
  assert.equal(encodePosition({ board, toMove }), 'W:0=Bs,31=Wo');

  // Square 25 is in range for Bashni (0..31) but out of range for Laska (0..24).
  assert.doesNotThrow(() => decodePosition('W:25=Ws', BASHNI));
  assert.throws(() => decodePosition('W:25=Ws'), /out of range/);
});

// ---- integration: self-play invariant -------------------------------------

test('Bashni self-play completes, plays only legal moves, conserves all 24 pieces', () => {
  let s = createInitialState(BASHNI);
  let outcome = gameStatus(s, { noProgressPlyLimit: 40 });
  let plies = 0;
  const CAP = 4000;
  while (outcome.state === 'ongoing' && plies < CAP) {
    assert.equal(countPieces(s.board), 24, `piece count drifted at ply ${plies}`);
    const moves = legalMoves(s);
    assert.ok(moves.length > 0);
    s = applyMove(s, moves[0]!); // deterministic: always the first legal move
    outcome = gameStatus(s, { noProgressPlyLimit: 40 });
    plies++;
  }
  assert.ok(plies < CAP, 'game should terminate via win or draw within the cap');
  assert.ok(outcome.state === 'win' || outcome.state === 'draw');
  assert.equal(countPieces(s.board), 24);
});

// ---- AI smoke -------------------------------------------------------------

test('the AI plays a legal Bashni move and the evaluator runs on 8x8', () => {
  const s = createInitialState(BASHNI);
  assert.doesNotThrow(() => evaluate(s, 'W'));
  const move = chooseMove(s, { depth: 2, random: () => 0 });
  assert.ok(move, 'expected a move');
  const legal = legalMoves(s).some(
    (m) => m.from === move!.from && m.to === move!.to,
  );
  assert.ok(legal, 'AI move must be legal');
});
