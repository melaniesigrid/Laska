import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matchmaker } from '../src/game/matchmaking.ts';

test('no pairing with fewer than two players', () => {
  const mm = new Matchmaker();
  mm.enqueue('a', 1500);
  assert.equal(mm.tryMatch(), null);
  assert.equal(mm.size, 1);
});

test('pairs two close-rated players immediately', () => {
  const mm = new Matchmaker();
  const now = 1_000_000;
  mm.enqueue('a', 1500, now);
  mm.enqueue('b', 1530, now);
  const pair = mm.tryMatch(now);
  assert.ok(pair);
  const ids = new Set([pair!.a.userId, pair!.b.userId]);
  assert.deepEqual(ids, new Set(['a', 'b']));
  assert.equal(mm.size, 0, 'paired players leave the queue');
});

test('does not pair players outside the initial window until wait widens it', () => {
  const mm = new Matchmaker({ baseWindow: 100, windowGrowthPerSec: 50, maxWindow: 1000 });
  const t0 = 1_000_000;
  mm.enqueue('low', 1200, t0);
  mm.enqueue('high', 1500, t0); // gap 300 > base window 100
  assert.equal(mm.tryMatch(t0), null, 'too far apart at first');
  // After ~5s, each window grows by ~250 -> min window ~350 > 300, so they pair.
  const pair = mm.tryMatch(t0 + 5000);
  assert.ok(pair, 'widened window should allow the pairing');
});

test('picks the closest-rated pair when several are waiting', () => {
  const mm = new Matchmaker();
  const now = 1_000_000;
  mm.enqueue('a', 1500, now);
  mm.enqueue('b', 1505, now);
  mm.enqueue('c', 1900, now);
  const pair = mm.tryMatch(now)!;
  assert.deepEqual(new Set([pair.a.userId, pair.b.userId]), new Set(['a', 'b']));
  assert.ok(mm.has('c'), 'the far-off player stays queued');
});

test('matchAll drains multiple pairings in one pass', () => {
  const mm = new Matchmaker();
  const now = 1_000_000;
  for (const [id, r] of [['a', 1500], ['b', 1510], ['c', 1520], ['d', 1530]] as const) {
    mm.enqueue(id, r, now);
  }
  const pairs = mm.matchAll(now);
  assert.equal(pairs.length, 2);
  assert.equal(mm.size, 0);
});

test('re-enqueue replaces the prior entry', () => {
  const mm = new Matchmaker();
  mm.enqueue('a', 1500);
  mm.enqueue('a', 1600);
  assert.equal(mm.size, 1);
});

test('variant is part of the matchmaking key: different variants never pair', () => {
  const mm = new Matchmaker();
  const now = 1_000_000;
  // Identical ratings, but different requested variants -> must NOT pair.
  mm.enqueue('classic', 1500, now, 'lasker-classic');
  mm.enqueue('strict', 1500, now, 'nestor-strict');
  assert.equal(mm.tryMatch(now), null, 'cross-variant pairing is forbidden');
  assert.equal(mm.size, 2, 'both players stay queued');
});

test('two players who requested the same variant pair together', () => {
  const mm = new Matchmaker();
  const now = 1_000_000;
  mm.enqueue('s1', 1500, now, 'nestor-strict');
  mm.enqueue('s2', 1510, now, 'nestor-strict');
  const pair = mm.tryMatch(now);
  assert.ok(pair, 'same-variant players pair');
  assert.deepEqual(new Set([pair!.a.userId, pair!.b.userId]), new Set(['s1', 's2']));
});

test('a default (no-variant) request is treated as lasker-classic and pairs with an explicit classic', () => {
  const mm = new Matchmaker();
  const now = 1_000_000;
  mm.enqueue('implicit', 1500, now); // no variant -> lasker-classic
  mm.enqueue('explicit', 1505, now, 'lasker-classic');
  const pair = mm.tryMatch(now);
  assert.ok(pair, 'implicit default matches explicit classic');
  assert.deepEqual(new Set([pair!.a.userId, pair!.b.userId]), new Set(['implicit', 'explicit']));
});

test('picks the closest same-variant pair even across variants', () => {
  const mm = new Matchmaker();
  const now = 1_000_000;
  mm.enqueue('classicLow', 1500, now, 'lasker-classic');
  mm.enqueue('strictNear', 1502, now, 'nestor-strict'); // closest by rating, wrong variant
  mm.enqueue('classicHigh', 1540, now, 'lasker-classic');
  const pair = mm.tryMatch(now)!;
  assert.deepEqual(
    new Set([pair.a.userId, pair.b.userId]),
    new Set(['classicLow', 'classicHigh']),
    'only same-variant players are eligible despite a closer cross-variant rating',
  );
  assert.ok(mm.has('strictNear'), 'the lone strict player stays queued');
});
