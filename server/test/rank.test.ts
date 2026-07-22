import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankFor, PROVISIONAL_GAMES, PROVISIONAL_RD } from '../src/rating/rank.ts';

/** A calibrated player: enough games + low RD so the general tier is reachable. */
function calibrated(rating: number) {
  return rankFor({ rating, ratingDeviation: 50, ratedGames: 30 });
}

test('the starting rating (1200) is a calibrated Sergeant ★2', () => {
  const r = calibrated(1200);
  assert.equal(r.name, 'Sergeant');
  assert.equal(r.key, 'sergeant');
  assert.equal(r.tier, 'climb');
  assert.equal(r.stars, 2);
  assert.equal(r.index, 10); // bandIdx 3 * 3 + (star 2 - 1)
  assert.equal(r.provisional, false);
});

test('every climb band/star boundary maps as specified (both sides)', () => {
  // [rating, name, stars, index]
  const cases: [number, string, number, number][] = [
    [600, 'Recruit', 1, 0],
    [949, 'Recruit', 3, 2],
    [950, 'Private', 1, 3],
    [1049, 'Private', 3, 5],
    [1050, 'Corporal', 1, 6],
    [1149, 'Corporal', 3, 8],
    [1150, 'Sergeant', 1, 9],
    [1249, 'Sergeant', 3, 11],
    [1250, 'Lieutenant', 1, 12],
    [1349, 'Lieutenant', 3, 14],
    [1350, 'Captain', 1, 15],
    [1449, 'Captain', 3, 17],
    [1450, 'Major', 1, 18],
    [1549, 'Major', 3, 20],
    [1550, 'Colonel', 1, 21],
    [1649, 'Colonel', 3, 23],
  ];
  for (const [rating, name, stars, index] of cases) {
    const r = calibrated(rating);
    assert.equal(r.name, name, `rating ${rating} -> ${name}`);
    assert.equal(r.stars, stars, `rating ${rating} -> ★${stars}`);
    assert.equal(r.index, index, `rating ${rating} index ${index}`);
    assert.equal(r.tier, 'climb');
  }
});

test('a single named band splits into exactly 3 ascending stars', () => {
  // Sergeant band is [1150, 1250). ~33.3 pts per star.
  assert.equal(calibrated(1160).stars, 1); // 1150.00–1183.33
  assert.equal(calibrated(1195).stars, 2); // 1183.33–1216.67
  assert.equal(calibrated(1230).stars, 3); // 1216.67–1250.00
  // Stars are strictly monotonic in rating across the band.
  assert.ok(calibrated(1160).index < calibrated(1195).index);
  assert.ok(calibrated(1195).index < calibrated(1230).index);
});

test('general tier: stars increment per 100 points, capped at 9', () => {
  const cases: [number, number, number][] = [
    // [rating, stars, index]
    [1650, 1, 24],
    [1749, 1, 24],
    [1750, 2, 25],
    [1849, 2, 25],
    [1950, 4, 27],
    [2350, 8, 31],
    [2449, 8, 31],
    [2450, 9, 32],
    [3000, 9, 32], // far beyond the cap stays ★9
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

test('the whole ladder is monotonic in index from bottom to top', () => {
  let prev = -1;
  for (const rating of [600, 950, 1100, 1200, 1300, 1500, 1649, 1650, 1800, 2450]) {
    const idx = calibrated(rating).index;
    assert.ok(idx >= prev, `index should not decrease at ${rating} (${idx} vs ${prev})`);
    prev = idx;
  }
});

test('★9 band reports full progress (it is the cap)', () => {
  assert.equal(calibrated(2450).progress, 1);
  assert.equal(calibrated(5000).progress, 1);
});

test('provisional gating: high RD at 1700 clamps to Colonel ★3, not General', () => {
  const highRd = rankFor({ rating: 1700, ratingDeviation: PROVISIONAL_RD + 1, ratedGames: 50 });
  assert.equal(highRd.name, 'Colonel', 'uncertain rating cannot fluke into a star');
  assert.equal(highRd.tier, 'climb');
  assert.equal(highRd.provisional, true);
  assert.equal(highRd.stars, 3, 'pinned to the climb ceiling');
  assert.equal(highRd.index, 23);
  assert.equal(highRd.progress, 1);

  const fewGames = rankFor({ rating: 1700, ratingDeviation: 40, ratedGames: PROVISIONAL_GAMES - 1 });
  assert.equal(fewGames.name, 'Colonel', 'too-few games cannot fluke into a star');
  assert.equal(fewGames.stars, 3);
  assert.equal(fewGames.provisional, true);

  // Exactly at the thresholds, the player is calibrated and the general tier opens.
  const justCalibrated = rankFor({ rating: 1700, ratingDeviation: PROVISIONAL_RD, ratedGames: PROVISIONAL_GAMES });
  assert.equal(justCalibrated.tier, 'general');
  assert.equal(justCalibrated.provisional, false);
  assert.equal(justCalibrated.stars, 1);
});

test('progress fraction within a star sub-band', () => {
  // Bottom of Sergeant ★1 -> 0; just below ★2 floor -> ~0.99.
  assert.equal(calibrated(1150).progress, 0);
  // Sergeant ★2 floor is 1183.33; 1200 sits halfway through it.
  assert.ok(Math.abs(calibrated(1200).progress - 0.5) < 1e-9);
  // First general star: 1650 -> 0, 1749 -> 0.99.
  assert.equal(calibrated(1650).progress, 0);
  assert.ok(Math.abs(calibrated(1749).progress - 0.99) < 1e-9);
});

test('provisional players still get stars within their band', () => {
  const r = rankFor({ rating: 1000, ratingDeviation: 350, ratedGames: 0 });
  assert.equal(r.name, 'Private');
  assert.equal(r.stars, 2); // 1000 is mid-Private (950 + ~50)
  assert.equal(r.provisional, true);
});
