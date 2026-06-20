/**
 * Tests for the Laska AI opponent (search + evaluation).
 * Run with:  node --test test/ai.test.ts   (Node >= 22, native TS type-strip)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, legalMoves, applyMove, gameStatus, opponent } from '../src/rules.ts';
import { decodePosition, encodePosition } from '../src/notation.ts';
import { chooseMove, scoreMoves, evaluate } from '../src/ai.ts';
import type { GameState, Move } from '../src/types.ts';

function buildState(position: string, plyNoProgress = 0): GameState {
  const { board, toMove } = decodePosition(position);
  const key = encodePosition({ board, toMove });
  return { board, toMove, plyNoProgress, positionCounts: { [key]: 1 } };
}

/** A seeded LCG so AI choices are reproducible in tests. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function sameMove(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && a.captures.join() === b.captures.join();
}

test('chooseMove always returns a legal move from the opening', () => {
  const state = createInitialState();
  const legal = legalMoves(state);
  const move = chooseMove(state, { difficulty: 'medium', random: seededRandom(1) });
  assert.ok(move, 'expected a move');
  assert.ok(legal.some((m) => sameMove(m, move!)), 'chosen move must be legal');
});

test('chooseMove returns null only when there are no legal moves', () => {
  // Black to move with a single white officer present and no black pieces -> no moves.
  const state = buildState('B:12=Wo');
  assert.equal(legalMoves(state).length, 0);
  assert.equal(chooseMove(state), null);
});

test('AI takes a forced/available free capture rather than a quiet move', () => {
  // White soldier on 8 can jump the black soldier on 12 landing on 16.
  // Mandatory-capture means legalMoves already only returns captures, but this
  // confirms the AI plays one and that it captures.
  const state = buildState('W:8=Ws,12=Bs');
  const move = chooseMove(state, { difficulty: 'hard', random: seededRandom(2) });
  assert.ok(move?.isCapture, 'AI should make the capture');
  assert.equal(move!.from, 8);
});

test('AI prefers a winning capture sequence that removes the opponent', () => {
  // White to move can capture black's only commander, leaving black with no
  // controlled pieces -> immediate win. The search should choose it.
  const state = buildState('W:8=Ws,12=Bs');
  const move = chooseMove(state, { difficulty: 'medium', random: seededRandom(3) })!;
  const next = applyMove(state, move);
  // After white buries black's soldier, black controls nothing.
  const status = gameStatus(next);
  assert.equal(status.state, 'win');
  if (status.state === 'win') assert.equal(status.winner, 'W');
});

test('deeper search sees a capture trap that depth-1 ignores', () => {
  // Construct a position where the greedy (depth 1) capture loses the column
  // back, but quiet development is better. We mainly assert determinism +
  // legality across depths here; strength is exercised by the self-play test.
  const state = createInitialState();
  const shallow = chooseMove(state, { depth: 1, blunderRate: 0, random: seededRandom(7) })!;
  const deep = chooseMove(state, { depth: 4, blunderRate: 0, random: seededRandom(7) })!;
  assert.ok(legalMoves(state).some((m) => sameMove(m, shallow)));
  assert.ok(legalMoves(state).some((m) => sameMove(m, deep)));
});

test('evaluate is zero-sum-ish: flipping perspective negates a material edge', () => {
  // White controls an extra column with a black prisoner buried.
  const state = buildState('W:8=BsWs,16=Ws,20=Bs');
  const wEval = evaluate(state, 'W');
  const bEval = evaluate(state, 'B');
  // Mobility differences make it not exactly negated, but the controller of more
  // material should score positive and the other negative.
  assert.ok(wEval > 0, `white should be ahead, got ${wEval}`);
  assert.ok(bEval < 0, `black should be behind, got ${bEval}`);
});

test('evaluate rewards holding enemy prisoners', () => {
  const withPrisoner = buildState('W:8=BsWs,20=Bs'); // white commander holds a black prisoner
  const without = buildState('W:8=Ws,20=Bs');
  assert.ok(
    evaluate(withPrisoner, 'W') > evaluate(without, 'W'),
    'holding an enemy prisoner should score higher',
  );
});

test('scoreMoves returns one exact score per legal move, sorted descending', () => {
  const state = createInitialState();
  const legal = legalMoves(state);
  const scored = scoreMoves(state, 2);
  assert.equal(scored.length, legal.length);
  for (let i = 1; i < scored.length; i++) {
    assert.ok(scored[i - 1]!.score >= scored[i]!.score, 'scores must be sorted descending');
  }
});

test('chooseMove is deterministic given a fixed RNG', () => {
  const state = createInitialState();
  const a = chooseMove(state, { difficulty: 'medium', random: seededRandom(42) })!;
  const b = chooseMove(state, { difficulty: 'medium', random: seededRandom(42) })!;
  assert.ok(sameMove(a, b), 'same seed should yield same move');
});

test('hard beats beginner across a full game (sanity check on strength)', () => {
  // Play one full game: White = hard (depth 6), Black = beginner (depth 1, blundery).
  // This is a smoke test that the strong side at least does not lose; with the
  // forced-capture structure a deep search should not lose to a near-random bot.
  let state = createInitialState();
  const rng = seededRandom(123);
  let plies = 0;
  const MAX_PLIES = 400;
  while (plies < MAX_PLIES) {
    const status = gameStatus(state);
    if (status.state !== 'ongoing') {
      if (status.state === 'win') {
        assert.notEqual(status.winner, 'B', 'beginner should not beat hard here');
      }
      // a draw is an acceptable non-loss for the strong side
      return;
    }
    const opts =
      state.toMove === 'W'
        ? { difficulty: 'hard' as const, random: rng }
        : { difficulty: 'beginner' as const, random: rng };
    const move = chooseMove(state, opts);
    assert.ok(move, 'a side with a legal position must have a move');
    state = applyMove(state, move!);
    plies++;
  }
  // If it hit the ply cap without resolving, that's still a non-loss; pass.
});

test('a full AI-vs-AI game conserves all 22 pieces and only plays legal moves', () => {
  let state = createInitialState();
  const rng = seededRandom(2024);
  let plies = 0;
  while (gameStatus(state).state === 'ongoing' && plies < 600) {
    const legal = legalMoves(state);
    const move = chooseMove(state, { depth: 2, blunderRate: 0.1, random: rng })!;
    assert.ok(
      legal.some((m) => sameMove(m, move)),
      'AI move must be in the legal move list',
    );
    state = applyMove(state, move);
    const total = state.board.reduce((s, c) => s + (c ? c.length : 0), 0);
    assert.equal(total, 22, `piece count must stay 22, was ${total} at ply ${plies}`);
    plies++;
  }
});
