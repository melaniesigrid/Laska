import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expectedScore,
  kFactor,
  updateRatings,
  K_PROVISIONAL,
  K_ESTABLISHED,
  PROVISIONAL_GAMES,
} from '../src/rating/elo.ts';

test('expectedScore is 0.5 for equal ratings and symmetric', () => {
  assert.equal(expectedScore(1500, 1500), 0.5);
  const e = expectedScore(1600, 1400);
  assert.ok(e > 0.5 && e < 1);
  // Opponent expectation complements to 1.
  assert.ok(Math.abs(expectedScore(1400, 1600) + e - 1) < 1e-9);
});

test('kFactor is higher while provisional', () => {
  assert.equal(kFactor(0), K_PROVISIONAL);
  assert.equal(kFactor(PROVISIONAL_GAMES - 1), K_PROVISIONAL);
  assert.equal(kFactor(PROVISIONAL_GAMES), K_ESTABLISHED);
});

test('winner gains and loser loses the same magnitude for equal ratings', () => {
  const { a, b } = updateRatings({ rating: 1500, ratedGames: 50 }, { rating: 1500, ratedGames: 50 }, 1);
  assert.ok(a.delta > 0);
  assert.ok(b.delta < 0);
  assert.equal(a.delta, -b.delta);
  assert.equal(a.after, 1500 + K_ESTABLISHED * 0.5); // 1510
});

test('beating a much stronger player yields a large gain', () => {
  const strong = updateRatings({ rating: 1400, ratedGames: 50 }, { rating: 1800, ratedGames: 50 }, 1);
  const equal = updateRatings({ rating: 1400, ratedGames: 50 }, { rating: 1400, ratedGames: 50 }, 1);
  assert.ok(strong.a.delta > equal.a.delta, 'upset should gain more than an even win');
});

test('a draw moves the lower-rated player up and the higher down', () => {
  const { a, b } = updateRatings({ rating: 1400, ratedGames: 50 }, { rating: 1700, ratedGames: 50 }, 0.5);
  assert.ok(a.delta > 0, 'underdog gains on a draw');
  assert.ok(b.delta < 0, 'favorite loses on a draw');
});

test('zero-sum-ish: total rating drift is bounded by rounding', () => {
  const { a, b } = updateRatings({ rating: 1532, ratedGames: 3 }, { rating: 1488, ratedGames: 80 }, 1);
  const drift = a.delta + b.delta;
  // Different K-factors mean it is not exactly zero-sum, but each side rounds.
  assert.ok(Number.isInteger(a.after) && Number.isInteger(b.after));
  assert.ok(Math.abs(drift) <= K_PROVISIONAL); // sane bound
});
