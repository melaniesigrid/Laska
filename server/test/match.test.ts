import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, MatchError } from '../src/game/match.ts';

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
