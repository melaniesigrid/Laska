import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, MatchError } from '../src/game/match.ts';
import { decodePosition, encodePosition, type GameState } from '../../src/index.ts';

/** Build a seed GameState from a FEN-like position string (test setup only). */
function buildState(position: string): GameState {
  const { board, toMove } = decodePosition(position);
  const key = encodePosition({ board, toMove });
  return { board, toMove, plyNoProgress: 0, positionCounts: { [key]: 1 } };
}

// Use real time by default so submitMove's default `now` is consistent with
// creation; timing-specific tests below pass explicit timestamps.
function newMatch() {
  return new Match({ id: 'm1', whiteId: 'white', blackId: 'black', ranked: true });
}

test('white moves first; a legal move flips the turn and is recorded', () => {
  const m = newMatch();
  assert.equal(m.toMove, 'W');
  const legal = m.legalMovesForCurrent();
  assert.ok(legal.length > 0);
  const mv = legal[0]!;
  const { ended } = m.submitMove('white', { from: mv.from, to: mv.to }, 1_000_100);
  assert.equal(ended, null);
  assert.equal(m.toMove, 'B');
  assert.equal(m.moveCount, 1);
});

test('a move from the wrong player is rejected as not-your-turn', () => {
  const m = newMatch();
  const mv = m.legalMovesForCurrent()[0]!;
  assert.throws(
    () => m.submitMove('black', { from: mv.from, to: mv.to }),
    (e: unknown) => e instanceof MatchError && e.code === 'not-your-turn',
  );
});

test('a non-player cannot move', () => {
  const m = newMatch();
  const mv = m.legalMovesForCurrent()[0]!;
  assert.throws(
    () => m.submitMove('stranger', { from: mv.from, to: mv.to }),
    (e: unknown) => e instanceof MatchError && e.code === 'not-a-player',
  );
});

test('an illegal move is rejected (server does not trust the client)', () => {
  const m = newMatch();
  assert.throws(
    () => m.submitMove('white', { from: 0, to: 24 }), // not a legal diagonal step
    (e: unknown) => e instanceof MatchError && e.code === 'illegal-move',
  );
});

test('the clock decrements for the mover and adds the increment', () => {
  const m = new Match({
    id: 'm2',
    whiteId: 'white',
    blackId: 'black',
    ranked: false,
    timeControl: { initialMs: 60_000, incrementMs: 2_000 },
    now: 0,
  });
  const mv = m.legalMovesForCurrent()[0]!;
  // White thinks for 10s then moves.
  m.submitMove('white', { from: mv.from, to: mv.to }, 10_000);
  const cs = m.clockState(10_000);
  // 60s - 10s spent + 2s increment = 52s.
  assert.equal(cs.whiteMs, 52_000);
  assert.equal(cs.blackMs, 60_000);
  assert.equal(cs.running, 'B');
});

test('a player who runs out of time flags and loses', () => {
  const m = new Match({
    id: 'm3',
    whiteId: 'white',
    blackId: 'black',
    ranked: true,
    timeControl: { initialMs: 5_000, incrementMs: 0 },
    now: 0,
  });
  // No move for 6s -> White (to move) flags.
  const end = m.checkTimeout(6_000);
  assert.ok(end);
  assert.equal(end!.reason, 'timeout');
  assert.equal(end!.winner, 'B');
  assert.equal(end!.result, '0-1');
  assert.ok(m.isOver);
});

test('resignation ends the game and awards the opponent', () => {
  const m = newMatch();
  const end = m.resign('white');
  assert.equal(end.reason, 'resignation');
  assert.equal(end.winner, 'B');
  assert.equal(end.result, '0-1');
  assert.ok(m.isOver);
});

test('draw offer must come from the opponent to be accepted', () => {
  const m = newMatch();
  m.offerDraw('white');
  // White cannot accept their own offer.
  assert.throws(() => m.acceptDraw('white'), (e: unknown) => e instanceof MatchError);
  const end = m.acceptDraw('black');
  assert.equal(end.reason, 'agreement');
  assert.equal(end.winner, null);
  assert.equal(end.result, '1/2-1/2');
});

// ---- per-match rule variant (server-authoritative enforcement) -----------
//
// Position W:0=Wo,4=BsBs: a White officer on 0 with two stacked Black soldiers
// on 4. Under lasker-classic the officer may jump square 4, land on 8, then
// turn around and jump square 4 a SECOND time, ending back on 0 (a same-square
// re-jump: from 0 -> to 0, captures [4,4]). Under nestor-strict that re-jump is
// forbidden, so the only legal capture is a single jump 0 -> 8 (captures [4]).
const REJUMP_POSITION = 'W:0=Wo,4=BsBs';

function rejumpMatch(variant: 'lasker-classic' | 'nestor-strict') {
  return new Match({
    id: `rj-${variant}`,
    whiteId: 'white',
    blackId: 'black',
    ranked: false,
    variant,
    initialState: buildState(REJUMP_POSITION),
  });
}

test('lasker-classic match ACCEPTS a same-square re-jump (0 -> 0, captures [4,4])', () => {
  const m = rejumpMatch('lasker-classic');
  // The re-jump landing (0 -> 0) is legal and applied by the engine.
  const { move } = m.submitMove('white', { from: 0, to: 0 });
  assert.deepEqual(move.captures, [4, 4], 'square 4 captured twice in one turn');
  assert.equal(m.toMove, 'B', 'turn flips after the accepted re-jump');
});

test('nestor-strict match REJECTS the same-square re-jump but allows the single jump', () => {
  const strict = rejumpMatch('nestor-strict');
  // The re-jump (0 -> 0) is NOT legal under strict: the server rejects it.
  assert.throws(
    () => strict.submitMove('white', { from: 0, to: 0 }),
    (e: unknown) => e instanceof MatchError && e.code === 'illegal-move',
    'strict mode must reject the same-square re-jump',
  );
  assert.equal(strict.toMove, 'W', 'turn unchanged after the rejected re-jump');
  // The single jump (0 -> 8, capturing 4 once) IS legal under strict.
  const { move } = strict.submitMove('white', { from: 0, to: 8 });
  assert.deepEqual(move.captures, [4], 'strict allows the single jump capturing square 4 once');
  assert.equal(strict.toMove, 'B');
});

test('the match exposes its variant (default lasker-classic when unspecified)', () => {
  assert.equal(newMatch().variant, 'lasker-classic', 'default variant unchanged');
  assert.equal(rejumpMatch('nestor-strict').variant, 'nestor-strict');
});

test('no moves are accepted after the game is over', () => {
  const m = newMatch();
  m.resign('white');
  const mv = m.legalMovesForCurrent();
  assert.equal(mv.length, 0);
  assert.throws(
    () => m.submitMove('black', { from: 0, to: 4 }),
    (e: unknown) => e instanceof MatchError && e.code === 'not-active',
  );
});
