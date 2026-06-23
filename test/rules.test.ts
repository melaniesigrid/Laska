/**
 * Exhaustive tests for the Laska rules engine.
 * Run with:  node --test test/rules.test.ts   (Node >= 22, native TS type-strip)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  controlledSquares,
} from '../src/rules.ts';
import { encodePosition, decodePosition } from '../src/notation.ts';
import type { Board, GameState, Move, PlayerColor } from '../src/types.ts';

// ---- test helpers ---------------------------------------------------------

function buildState(position: string, plyNoProgress = 0): GameState {
  const { board, toMove } = decodePosition(position);
  const key = encodePosition({ board, toMove });
  return { board, toMove, plyNoProgress, positionCounts: { [key]: 1 } };
}

/** Find and apply the (unique) legal move from->to. Throws if not legal. */
function play(state: GameState, from: number, to: number): GameState {
  const m = legalMoves(state).find((mv) => mv.from === from && mv.to === to);
  if (!m) {
    throw new Error(
      `No legal move ${from}->${to}. Legal: ${legalMoves(state)
        .map((mv) => `${mv.from}->${mv.to}`)
        .join(', ')}`,
    );
  }
  return applyMove(state, m);
}

function countPieces(board: Board): number {
  return board.reduce((sum, col) => sum + (col ? col.length : 0), 0);
}

function toSet(nums: number[]): Set<number> {
  return new Set(nums);
}

/** Assert exactly one legal move and return it (typed non-undefined). */
function sole(moves: Move[]): Move {
  assert.equal(moves.length, 1);
  return moves[0]!;
}

/** Return the first move, asserting at least one exists (typed non-undefined). */
function firstMove(moves: Move[]): Move {
  assert.ok(moves.length > 0, 'expected at least one legal move');
  return moves[0]!;
}

// ---- setup ----------------------------------------------------------------

test('initial position: 11 soldiers each, centre empty, White to move', () => {
  const s = createInitialState();
  assert.equal(s.toMove, 'W');
  assert.deepEqual(toSet(controlledSquares(s.board, 'W')), toSet([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  assert.deepEqual(toSet(controlledSquares(s.board, 'B')), toSet([14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]));
  assert.equal(s.board[11], null);
  assert.equal(s.board[12], null);
  assert.equal(s.board[13], null);
  assert.equal(countPieces(s.board), 22);
  // every piece is a soldier
  for (const col of s.board) {
    if (col) for (const p of col) assert.equal(p.rank, 'soldier');
  }
});

test('initial position has exactly 6 legal opening moves, all non-captures', () => {
  const s = createInitialState();
  const moves = legalMoves(s);
  assert.equal(moves.length, 6);
  assert.ok(moves.every((m) => !m.isCapture));
  const targets = toSet(moves.map((m) => m.to));
  // front-row White soldiers (idx 7,8,9,10) advance into row 3 (idx 11,12,13)
  assert.deepEqual(targets, toSet([11, 12, 13]));
});

// ---- movement -------------------------------------------------------------

test('soldier moves forward only; officer moves both ways', () => {
  const soldier = buildState('W:12=Ws');
  assert.deepEqual(
    toSet(legalMoves(soldier).map((m) => m.to)),
    toSet([15, 16]), // forward NE/NW from (3,3)
  );

  const officer = buildState('W:12=Wo');
  assert.deepEqual(
    toSet(legalMoves(officer).map((m) => m.to)),
    toSet([8, 9, 15, 16]), // all four diagonals
  );
});

// ---- mandatory capture ----------------------------------------------------

test('capture is mandatory: quiet moves are suppressed when a capture exists', () => {
  // White soldier @8 can quietly go to 11, but a capture over Black @12 exists.
  const s = buildState('W:8=Ws,12=Bs');
  const moves = legalMoves(s);
  assert.ok(moves.length >= 1);
  assert.ok(moves.every((m) => m.isCapture), 'all returned moves must be captures');
  assert.ok(moves.some((m) => m.from === 8 && m.to === 16), 'the 8->16 capture must be present');
  assert.ok(!moves.some((m) => m.to === 11), 'quiet move to 11 must be suppressed');
});

test('basic capture: top prisoner goes to bottom, commander stays on top, jumped square clears', () => {
  const s = buildState('W:8=Ws,12=Bs');
  const next = applyMove(s, legalMoves(s).find((m) => m.from === 8 && m.to === 16)!);
  assert.equal(next.board[8], null);
  assert.equal(next.board[12], null); // single piece jumped -> square empties
  assert.deepEqual(next.board[16], [
    { color: 'B', rank: 'soldier' }, // prisoner at the bottom
    { color: 'W', rank: 'soldier' }, // capturing commander stays on top
  ]);
  assert.equal(next.toMove, 'B');
  assert.equal(countPieces(next.board), 2); // nothing removed from the board
});

test('column ownership flips: jumping the top of a mixed column can hand the square to the jumper', () => {
  // Square 12 = [Ws(bottom), Bs(top)] is Black-controlled. White @8 jumps it.
  const s = buildState('W:8=Ws,12=WsBs');
  const next = applyMove(s, legalMoves(s).find((m) => m.from === 8 && m.to === 16)!);
  // Black commander captured; the White soldier underneath is now exposed and
  // the square is controlled by White.
  assert.deepEqual(next.board[12], [{ color: 'W', rank: 'soldier' }]);
  assert.deepEqual(toSet(controlledSquares(next.board, 'W')), toSet([12, 16]));
  assert.deepEqual(toSet(controlledSquares(next.board, 'B')), toSet([]));
  assert.deepEqual(next.board[16], [
    { color: 'B', rank: 'soldier' },
    { color: 'W', rank: 'soldier' },
  ]);
});

// ---- chained captures -----------------------------------------------------

test('multi-jump chain is forced as a single move and stacks prisoners in order', () => {
  // White @0 must jump 4 (->8) then 12 (->16); no option to stop at 8.
  const s = buildState('W:0=Ws,4=Bs,12=Bs');
  const moves = legalMoves(s);
  const m = sole(moves);
  assert.deepEqual(m.path, [8, 16]);
  assert.deepEqual(m.captures, [4, 12]);
  assert.equal(m.promotion, false);
  const next = applyMove(s, m);
  assert.equal(next.board[0], null);
  assert.equal(next.board[4], null);
  assert.equal(next.board[8], null); // piece passed through, did not stay
  assert.equal(next.board[12], null);
  assert.deepEqual(next.board[16], [
    { color: 'B', rank: 'soldier' }, // first captured -> bottom
    { color: 'B', rank: 'soldier' }, // second captured -> just above it
    { color: 'W', rank: 'soldier' }, // commander on top
  ]);
  assert.equal(countPieces(next.board), 3);
});

test('officer chain may include a backward jump', () => {
  // White officer @8: forward over 12 (->16), then backward over 13 (->10).
  const s = buildState('W:8=Wo,12=Bs,13=Bs');
  const moves = legalMoves(s);
  const m = sole(moves);
  assert.deepEqual(m.path, [16, 10]);
  assert.deepEqual(m.captures, [12, 13]);
  const next = applyMove(s, m);
  assert.deepEqual(next.board[10], [
    { color: 'B', rank: 'soldier' },
    { color: 'B', rank: 'soldier' },
    { color: 'W', rank: 'officer' },
  ]);
  for (const sq of [8, 12, 13, 16]) assert.equal(next.board[sq], null);
});

test('player may choose freely among multiple captures (no maximum-capture rule)', () => {
  // White @8 can jump 11 (->14) OR 12 (->16); both are single captures.
  const s = buildState('W:8=Ws,11=Bs,12=Bs');
  const moves = legalMoves(s);
  assert.equal(moves.length, 2);
  assert.deepEqual(toSet(moves.map((m) => m.to)), toSet([14, 16]));
  assert.ok(moves.every((m) => m.captures.length === 1));
});

// ---- open question: jumping the same square twice -------------------------

test('officer multi-capture: the SAME square IS jumped twice (documents current behavior)', () => {
  // OPEN INTERPRETIVE QUESTION. The nestorgames Laska rulebook (Néstor Romeral
  // Andrés, 2018) says an officer may make several captures in one turn "but not
  // jumping over the same space more than once." Our engine's capture search
  // (captureSequencesFrom in src/rules.ts) does NOT track visited mid-squares; it
  // guarantees termination only by burying the captured top piece at the bottom of
  // the moving column. So if a jumped column is still ENEMY-controlled on top after
  // its top piece is taken (a two-deep enemy stack), the same square can be jumped
  // a second time. This position is the minimal reproduction and IS reachable.
  //
  //   Square 0 = White officer.  Square 4 = [Bs(bottom), Bs(top)] (Black-controlled).
  //   Geometry: 0=(0,0) 4=(1,1) 8=(2,2).
  //   Jump 1: 0 --NE--> over 4 --> land 8.  Square 4 still has one Bs -> still Black.
  //   Jump 2: 8 --SW--> over 4 (again!) --> land 0 (now vacant).  Square 4 empties.
  //
  // This test ASSERTS the current (rulebook-violating) behavior so it is a
  // regression anchor. If we ever adopt the nestorgames "no square twice" rule,
  // this expectation must change (and Lasker's 1911 games must still replay).
  const s = buildState('W:0=Wo,4=BsBs');
  const moves = legalMoves(s);
  const m = sole(moves);
  assert.deepEqual(m.path, [8, 0]);
  assert.deepEqual(m.captures, [4, 4], 'square 4 is currently jumped TWICE in one turn');

  const next = applyMove(s, m);
  // Both Black soldiers end up buried under the officer, back on square 0.
  assert.deepEqual(next.board[0], [
    { color: 'B', rank: 'soldier' },
    { color: 'B', rank: 'soldier' },
    { color: 'W', rank: 'officer' },
  ]);
  assert.equal(next.board[4], null);
  assert.equal(next.board[8], null);
  assert.equal(countPieces(next.board), 3); // nothing leaves the board
});

// ---- promotion ------------------------------------------------------------

test('promotion on a quiet move: only the commander is crowned', () => {
  // Column 18 = [Bs(bottom), Ws(top)] advances to back rank 22.
  const s = buildState('W:18=BsWs');
  const next = play(s, 18, 22);
  assert.deepEqual(next.board[22], [
    { color: 'B', rank: 'soldier' }, // untouched prisoner
    { color: 'W', rank: 'officer' }, // promoted commander
  ]);
});

test('promotion mid-chain ENDS the move, even when a further capture exists', () => {
  // White soldier @16 jumps 19 and lands on back rank 22 (promotion).
  // A king on 22 could then jump 18 (->14), but promotion ends the move, so the
  // engine must NOT offer that continuation.
  const s = buildState('W:16=Ws,18=Bs,19=Bs');
  const moves = legalMoves(s);
  const m = sole(moves);
  assert.equal(m.to, 22);
  assert.deepEqual(m.captures, [19], 'must capture only 19, not chain onto 18');
  assert.equal(m.promotion, true);

  const next = applyMove(s, m);
  assert.deepEqual(next.board[22], [
    { color: 'B', rank: 'soldier' },
    { color: 'W', rank: 'officer' },
  ]);
  assert.deepEqual(next.board[18], [{ color: 'B', rank: 'soldier' }], 'piece 18 survives uncaptured');
  assert.equal(next.board[19], null);
});

// ---- win / draw -----------------------------------------------------------

test('win when a player controls no pieces', () => {
  const s = buildState('B:8=Ws'); // Black to move, Black controls nothing
  assert.deepEqual(gameStatus(s), { state: 'win', winner: 'W', reason: 'no-pieces' });
});

test('win when a player has pieces but no legal move', () => {
  // Black soldier @24 is blocked: only forward square 20 is occupied (White),
  // and the square beyond (16) is occupied, so no capture either.
  const s = buildState('B:16=Ws,20=Ws,24=Bs');
  assert.equal(legalMoves(s).length, 0);
  assert.deepEqual(gameStatus(s), { state: 'win', winner: 'W', reason: 'no-moves' });
});

test('threefold repetition is a draw', () => {
  // Two officers in opposite corners shuffle without ever interacting.
  let s = buildState('W:0=Wo,24=Bo');
  // one full cycle returns to the start position
  const cycle = (st: GameState) => {
    st = play(st, 0, 4);
    st = play(st, 24, 20);
    st = play(st, 4, 0);
    st = play(st, 20, 24);
    return st;
  };
  assert.equal(gameStatus(s).state, 'ongoing');
  s = cycle(s); // start position now seen twice
  assert.equal(gameStatus(s).state, 'ongoing');
  s = cycle(s); // ...and a third time
  assert.deepEqual(gameStatus(s), { state: 'draw', reason: 'threefold-repetition' });
});

test('no-progress counter increments on king moves and can trigger a draw', () => {
  const s = buildState('W:0=Wo,24=Bo');
  const after = play(s, 0, 4); // officer move = no progress
  assert.equal(after.plyNoProgress, 1);
  assert.deepEqual(gameStatus(after, { noProgressPlyLimit: 1 }), {
    state: 'draw',
    reason: 'no-progress',
  });
});

test('a soldier move resets the no-progress counter', () => {
  let s = buildState('W:0=Wo,9=Ws,24=Bo');
  s = play(s, 0, 4); // W officer, no progress -> 1
  assert.equal(s.plyNoProgress, 1);
  s = play(s, 24, 20); // B officer, no progress -> 2
  assert.equal(s.plyNoProgress, 2);
  s = play(s, 9, 13); // W soldier advance = progress -> reset to 0
  assert.equal(s.plyNoProgress, 0);
});

// ---- serialization --------------------------------------------------------

test('position notation round-trips', () => {
  const init = createInitialState();
  const encoded = encodePosition(init);
  const decoded = decodePosition(encoded);
  assert.equal(encodePosition(decoded), encoded);

  const canonical = 'B:0=WsBo,5=Bs,16=BsBsWo,24=Wo';
  assert.equal(encodePosition(decodePosition(canonical)), canonical);
});

test('decodePosition rejects malformed input', () => {
  assert.throws(() => decodePosition('no-colon-here'));
  assert.throws(() => decodePosition('X:0=Ws')); // bad side to move
  assert.throws(() => decodePosition('W:99=Ws')); // square out of range
  assert.throws(() => decodePosition('W:0=Wx')); // odd-length / bad stack
});

// ---- immutability ---------------------------------------------------------

test('applyMove does not mutate the input state', () => {
  const s = buildState('W:8=Ws,12=Bs');
  const before = encodePosition(s);
  const beforeCounts = JSON.stringify(s.positionCounts);
  applyMove(s, legalMoves(s).find((m) => m.from === 8 && m.to === 16)!);
  assert.equal(encodePosition(s), before, 'board/side unchanged');
  assert.equal(JSON.stringify(s.positionCounts), beforeCounts, 'positionCounts unchanged');
});

// ---- integration: self-play invariant -------------------------------------

test('self-play to completion never throws, plays only legal moves, conserves all 22 pieces', () => {
  let s = createInitialState();
  let outcome = gameStatus(s, { noProgressPlyLimit: 40 });
  let plies = 0;
  const CAP = 2000;
  while (outcome.state === 'ongoing' && plies < CAP) {
    assert.equal(countPieces(s.board), 22, `piece count drifted at ply ${plies}`);
    const moves = legalMoves(s);
    s = applyMove(s, firstMove(moves)); // deterministic: always first legal move
    outcome = gameStatus(s, { noProgressPlyLimit: 40 });
    plies++;
  }
  assert.ok(plies < CAP, 'game should terminate via win or draw within the cap');
  assert.ok(outcome.state === 'win' || outcome.state === 'draw');
  assert.equal(countPieces(s.board), 22);
});
