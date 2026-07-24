/**
 * Unit tests for the pure streak module (`streak.ts`).
 *
 * The web package has no configured test runner, but `streak.ts` is pure (no
 * React, no DOM, no storage), so it runs directly under Node's built-in test
 * runner with native TS stripping (Node >= 22), the same way the engine tests do:
 *
 *     node --test web/src/streak.test.ts        # from the web/ dir, or absolute
 *
 * Days are passed explicitly as `YYYY-MM-DD` keys so the tests never depend on the
 * machine's wall clock.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialStreakState,
  recordAction,
  reconcile,
  isBroken,
  isCountedToday,
  daysBetween,
  dayKey,
  dayKeyOffset,
  STARTING_FREEZES,
  MAX_FREEZES,
  FREEZE_EARN_EVERY,
} from './streak.ts';

test('dayKey is a local-calendar YYYY-MM-DD key', () => {
  assert.equal(dayKey(new Date(2026, 5, 23, 13, 30)), '2026-06-23');
  assert.equal(dayKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});

test('daysBetween counts calendar days, sign-aware', () => {
  assert.equal(daysBetween('2026-06-23', '2026-06-24'), 1);
  assert.equal(daysBetween('2026-06-23', '2026-06-23'), 0);
  assert.equal(daysBetween('2026-06-24', '2026-06-23'), -1);
  assert.equal(daysBetween('2026-06-23', '2026-06-30'), 7);
  // across a month boundary
  assert.equal(daysBetween('2026-01-31', '2026-02-01'), 1);
});

test('dayKeyOffset walks calendar days across boundaries', () => {
  assert.equal(dayKeyOffset('2026-06-23', -1), '2026-06-22');
  assert.equal(dayKeyOffset('2026-02-28', 1), '2026-03-01'); // 2026 is not a leap year
  assert.equal(dayKeyOffset('2026-01-01', -1), '2025-12-31');
});

test('first action starts a streak at 1 and seeds starting freezes', () => {
  const t = recordAction(initialStreakState(), '2026-06-23');
  assert.equal(t.kind, 'advanced');
  if (t.kind !== 'advanced') return;
  assert.equal(t.state.current, 1);
  assert.equal(t.state.longest, 1);
  assert.equal(t.state.lastActiveDay, '2026-06-23');
  assert.equal(t.state.freezes, STARTING_FREEZES);
  assert.equal(t.length, 1);
});

test('same-day repeat action is idempotent', () => {
  const day1 = recordAction(initialStreakState(), '2026-06-23').state;
  const t = recordAction(day1, '2026-06-23');
  assert.equal(t.kind, 'already-counted');
  assert.equal(t.state, day1);
  assert.ok(isCountedToday(day1, '2026-06-23'));
  assert.ok(!isCountedToday(day1, '2026-06-24'));
});

test('consecutive days advance the streak', () => {
  let s = recordAction(initialStreakState(), '2026-06-23').state;
  s = recordAction(s, '2026-06-24').state;
  const t = recordAction(s, '2026-06-25');
  assert.equal(t.kind, 'advanced');
  if (t.kind !== 'advanced') return;
  assert.equal(t.state.current, 3);
  assert.equal(t.state.longest, 3);
  assert.equal(t.freezesSpent, 0);
});

test('a single missed day is auto-bridged by one freeze (streak survives)', () => {
  const s = recordAction(initialStreakState(), '2026-06-23').state; // freezes = 2
  // skip the 24th entirely; act on the 25th
  const t = recordAction(s, '2026-06-25');
  assert.equal(t.kind, 'advanced');
  if (t.kind !== 'advanced') return;
  assert.equal(t.state.current, 2, 'streak continued, not reset');
  assert.equal(t.freezesSpent, 1);
  assert.equal(t.state.freezes, STARTING_FREEZES - 1);
});

test('a gap larger than freezes breaks the streak and starts a new one', () => {
  let s = recordAction(initialStreakState(), '2026-06-01').state; // 2 freezes
  s = recordAction(s, '2026-06-02').state;
  s = recordAction(s, '2026-06-03').state; // current = 3, freezes = 2
  // miss the 4th, 5th, 6th (3 missed days) — only 2 freezes can't cover it
  const t = recordAction(s, '2026-06-07');
  assert.equal(t.kind, 'reset-then-advanced');
  if (t.kind !== 'reset-then-advanced') return;
  assert.equal(t.previousLength, 3);
  assert.equal(t.state.current, 1, 'new streak starts at 1');
  assert.equal(t.state.longest, 3, 'longest preserved');
  assert.equal(t.length, 1);
});

test('isBroken projects a lapse without mutating, respecting freezes', () => {
  const s = recordAction(initialStreakState(), '2026-06-23').state; // freezes = 2
  assert.equal(isBroken(s, '2026-06-23'), false, 'same day intact');
  assert.equal(isBroken(s, '2026-06-24'), false, 'yesterday intact');
  assert.equal(isBroken(s, '2026-06-26'), false, '2 missed days, 2 freezes cover it');
  assert.equal(isBroken(s, '2026-06-27'), true, '3 missed days exceed 2 freezes');
});

test('reconcile spends freezes for a silent lapse and holds the streak', () => {
  const s = recordAction(initialStreakState(), '2026-06-23').state; // current 1, freezes 2
  // Two days later (one missed day: the 24th). One freeze absorbs it.
  const r = reconcile(s, '2026-06-25');
  assert.equal(r.brokenFrom, null);
  assert.equal(r.state.freezes, 1, 'one freeze spent');
  assert.equal(r.state.current, 1, 'count held, not advanced');
  assert.equal(r.state.lastActiveDay, '2026-06-24', 'held to yesterday so it stays intact');
});

test('reconcile reports a break when freezes cannot cover the lapse', () => {
  let s = recordAction(initialStreakState(), '2026-06-01').state;
  s = recordAction(s, '2026-06-02').state; // current 2, freezes 2
  // Five days later: 4 missed days, only 2 freezes.
  const r = reconcile(s, '2026-06-07');
  assert.equal(r.brokenFrom, 2);
  assert.equal(r.state.current, 0);
});

test('reconcile is a no-op when today or yesterday was active', () => {
  const s = recordAction(initialStreakState(), '2026-06-23').state;
  assert.equal(reconcile(s, '2026-06-23').state, s);
  assert.equal(reconcile(s, '2026-06-24').state, s);
});

test('freezes are earned every FREEZE_EARN_EVERY days, capped at MAX_FREEZES', () => {
  let s = initialStreakState();
  let earnedCount = 0;
  // Play consecutively for enough days to trigger multiple earns.
  for (let i = 0; i < FREEZE_EARN_EVERY * (MAX_FREEZES + 2); i++) {
    const day = dayKeyOffset('2026-01-01', i);
    const t = recordAction(s, day);
    assert.notEqual(t.kind, 'already-counted');
    if (t.kind === 'advanced' && t.freezeEarned) earnedCount++;
    s = t.state;
  }
  assert.ok(earnedCount >= 1, 'at least one freeze earned over the run');
  assert.ok(s.freezes <= MAX_FREEZES, 'never exceeds the cap');
  assert.equal(s.freezes, MAX_FREEZES, 'a long run reaches the cap');
});

test('starting freezes never let a streak be pay-to-win — they only preserve count', () => {
  // Sanity: a freeze changes only `current`/`freezes`, never produces a count the
  // player did not play toward. After bridging, current === days actually acted on.
  let s = recordAction(initialStreakState(), '2026-06-23').state; // acted day 1
  s = recordAction(s, '2026-06-25').state; // missed 24th, acted day 2 (bridged)
  assert.equal(s.current, 2, 'two real actions = count of 2, freeze only saved the run');
});
