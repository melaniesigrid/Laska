import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankFor, PROVISIONAL_GAMES, PROVISIONAL_RD } from '../src/rating/rank.ts';

/** A calibrated player: enough games + low RD so the general tier is reachable. */
function calibrated(rating: number) {
  return rankFor({ rating, ratingDeviation: 50, ratedGames: 30 });
}

test('the starting rating (1200) is a calibrated Sergeant', () => {
  const r = calibrated(1200);
  assert.equal(r.name, 'Sergeant');
  assert.equal(r.key, 'sergeant');
  assert.equal(r.tier, 'climb');
  assert.equal(r.stars, 0);
  assert.equal(r.index, 3);
  assert.equal(r.provisional, false);
});

test('every climb band boundary maps as specified (both sides)', () => {
  // [rating, expected name, expected index]
  const cases: [number, string, number][] = [
    [600, 'Recruit', 0],
    [949, 'Recruit', 0],
    [950, 'Private', 1],
    [1049, 'Private', 1],
    [1050, 'Corporal', 2],
    [1149, 'Corporal', 2],
    [1150, 'Sergeant', 3],
    [1249, 'Sergeant', 3],
    [1250, 'Lieutenant', 4],
    [1349, 'Lieutenant', 4],
    [1350, 'Captain', 5],
    [1449, 'Captain', 5],
    [1450, 'Major', 6],
    [1549, 'Major', 6],
    [1550, 'Colonel', 7],
    [1649, 'Colonel', 7],
  ];
  for (const [rating, name, index] of cases) {
    const r = calibrated(rating);
    assert.equal(r.name, name, `rating ${rating} -> ${name}`);
    assert.equal(r.index, index, `rating ${rating} index ${index}`);
    assert.equal(r.tier, 'climb');
  }
});

test('general tier: stars increment per 100 points, capped at 9', () => {
  const cases: [number, number, number][] = [
    // [rating, expected stars, expected index]
    [1650, 1, 8],
    [1749, 1, 8],
    [1750, 2, 9],
    [1849, 2, 9],
    [1950, 4, 11],
    [2350, 8, 15],
    [2449, 8, 15],
    [2450, 9, 16],
    [3000, 9, 16], // far beyond the cap stays ★9
  ];
  for (const [rating, stars, index] of cases) {
    const r = calibrated(rating);
    assert.equal(r.tier, 'general', `rating ${rating} is general tier`);
    assert.equal(r.name, 'General');
    assert.equal(r.key, 'general');
    assert.equal(r.stars, stars, `rating ${rating} -> ★${stars}`);
    assert.equal(r.index, index, `rating ${rating} index ${index}`);
  }
});

test('★9 band reports full progress (it is the cap)', () => {
  assert.equal(calibrated(2450).progress, 1);
  assert.equal(calibrated(5000).progress, 1);
});

test('provisional gating: high RD at 1700 clamps to Colonel, not General', () => {
  const highRd = rankFor({ rating: 1700, ratingDeviation: PROVISIONAL_RD + 1, ratedGames: 50 });
  assert.equal(highRd.name, 'Colonel', 'uncertain rating cannot fluke into a star');
  assert.equal(highRd.tier, 'climb');
  assert.equal(highRd.provisional, true);
  assert.equal(highRd.stars, 0);

  const fewGames = rankFor({ rating: 1700, ratingDeviation: 40, ratedGames: PROVISIONAL_GAMES - 1 });
  assert.equal(fewGames.name, 'Colonel', 'too-few games cannot fluke into a star');
  assert.equal(fewGames.provisional, true);

  // Exactly at the thresholds, the player is calibrated and the star opens up.
  const justCalibrated = rankFor({ rating: 1700, ratingDeviation: PROVISIONAL_RD, ratedGames: PROVISIONAL_GAMES });
  assert.equal(justCalibrated.tier, 'general');
  assert.equal(justCalibrated.provisional, false);
  assert.equal(justCalibrated.stars, 1);
});

test('progress fraction at band edges', () => {
  // Bottom of Sergeant -> 0; just below the next floor -> ~0.99.
  assert.equal(calibrated(1150).progress, 0);
  assert.ok(Math.abs(calibrated(1249).progress - 0.99) < 1e-9);
  // Midband Sergeant -> 0.5.
  assert.ok(Math.abs(calibrated(1200).progress - 0.5) < 1e-9);
  // First star band: 1650 -> 0, 1749 -> 0.99.
  assert.equal(calibrated(1650).progress, 0);
  assert.ok(Math.abs(calibrated(1749).progress - 0.99) < 1e-9);
});

test('provisional flag is independent of band for low ratings', () => {
  const r = rankFor({ rating: 1000, ratingDeviation: 350, ratedGames: 0 });
  assert.equal(r.name, 'Private');
  assert.equal(r.provisional, true);
});
