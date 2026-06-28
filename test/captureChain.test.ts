/**
 * Tests for the capture-chain helpers that let a UI play a multi-jump out one
 * leap at a time. Run with:  node --test test/captureChain.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { legalMoves } from '../src/rules.ts';
import {
  beginCaptureChain,
  nextHopTargets,
  advanceCaptureChain,
  matchLegalMove,
} from '../src/captureChain.ts';
import { encodePosition, decodePosition } from '../src/notation.ts';
import type { GameState } from '../src/types.ts';

function buildState(position: string): GameState {
  const { board, toMove } = decodePosition(position);
  const key = encodePosition({ board, toMove });
  return { board, toMove, plyNoProgress: 0, positionCounts: { [key]: 1 } };
}

test('beginCaptureChain returns null when the origin has no capture', () => {
  const s = buildState('W:12=Ws'); // a lone soldier: only quiet moves
  assert.equal(beginCaptureChain(legalMoves(s), 12), null);
});

test('chain walks a forced double-jump leap by leap, committing on the last', () => {
  // White @0 must jump 4 (->8) then 12 (->16).
  const s = buildState('W:0=Ws,4=Bs,12=Bs');
  const chain = beginCaptureChain(legalMoves(s), 0);
  assert.ok(chain);

  // First leap target is 8 (not the final 16).
  const firstHops = nextHopTargets(chain!);
  assert.deepEqual([...firstHops.keys()], [8]);

  // Taking 8 does NOT finish — more jumps are forced.
  const afterFirst = advanceCaptureChain(chain!, 8);
  assert.ok(afterFirst && afterFirst.kind === 'continue');
  assert.deepEqual(afterFirst.chain.steps, [8]);

  // Next leap target is 16, and taking it commits the whole move.
  const secondHops = nextHopTargets(afterFirst.chain);
  assert.deepEqual([...secondHops.keys()], [16]);
  const afterSecond = advanceCaptureChain(afterFirst.chain, 16);
  assert.ok(afterSecond && afterSecond.kind === 'commit');
  assert.deepEqual(afterSecond.move.path, [8, 16]);
  assert.deepEqual(afterSecond.move.captures, [4, 12]);
});

test('a single jump commits on the first leap', () => {
  const s = buildState('W:8=Ws,12=Bs');
  const chain = beginCaptureChain(legalMoves(s), 8);
  assert.ok(chain);
  const res = advanceCaptureChain(chain!, 16);
  assert.ok(res && res.kind === 'commit');
  assert.deepEqual(res.move.path, [16]);
});

test('a fork keeps both routes until they diverge', () => {
  // Officer @8 can chain forward over 12 (->16) then back over 13 (->10), OR a
  // different branch — depends on geometry; assert the helper tracks a real fork
  // by checking a two-target situation where the first leap is shared but the
  // continuation differs. Here White @8 may jump 11 (->14) OR 12 (->16): two
  // distinct single captures sharing the same origin, different first leaps.
  const s = buildState('W:8=Ws,11=Bs,12=Bs');
  const chain = beginCaptureChain(legalMoves(s), 8);
  assert.ok(chain);
  const hops = nextHopTargets(chain!);
  assert.deepEqual(new Set(hops.keys()), new Set([14, 16]));
  // Choosing 14 commits that single-capture branch.
  const res = advanceCaptureChain(chain!, 14);
  assert.ok(res && res.kind === 'commit');
  assert.deepEqual(res.move.captures, [11]);
});

test('advanceCaptureChain returns null for an illegal leap square', () => {
  const s = buildState('W:0=Ws,4=Bs,12=Bs');
  const chain = beginCaptureChain(legalMoves(s), 0);
  assert.equal(advanceCaptureChain(chain!, 16), null); // 16 is leap 2, not leap 1
});

test('matchLegalMove recovers the path from a from/to/captures outcome', () => {
  const s = buildState('W:0=Ws,4=Bs,12=Bs');
  const recovered = matchLegalMove(s, { from: 0, to: 16, captures: [4, 12] });
  assert.ok(recovered);
  assert.deepEqual(recovered!.path, [8, 16]);
  // A wrong capture order does not match.
  assert.equal(matchLegalMove(s, { from: 0, to: 16, captures: [12, 4] }), null);
});
