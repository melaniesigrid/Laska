import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  updatePlayer,
  inflateDeviation,
  bothPlayers,
  DEFAULT_RD,
  DEFAULT_VOLATILITY,
  MIN_RD,
  GLICKO2_SCALE,
  RATING_PERIOD_MS,
  STARTING_RATING,
  type Glicko2State,
} from '../src/rating/glicko2.ts';

function fresh(rating = STARTING_RATING): Glicko2State {
  return { rating, ratingDeviation: DEFAULT_RD, volatility: DEFAULT_VOLATILITY };
}

test('a win raises rating and lowers RD', () => {
  const self = fresh();
  const opp = fresh();
  const after = updatePlayer(self, opp, 1);
  assert.ok(after.rating > self.rating, 'rating goes up on a win');
  assert.ok(after.ratingDeviation < self.ratingDeviation, 'RD shrinks after a game');
  assert.ok(after.ratingDeviation >= MIN_RD, 'RD never below the floor');
});

test('a loss lowers rating', () => {
  const after = updatePlayer(fresh(), fresh(), 0);
  assert.ok(after.rating < STARTING_RATING);
});

test('symmetry: equal players, win vs loss are mirror images about the anchor', () => {
  const winner = updatePlayer(fresh(), fresh(), 1);
  const loser = updatePlayer(fresh(), fresh(), 0);
  // Gains and losses are equal magnitude for identical equal-rated players.
  assert.equal(winner.rating - STARTING_RATING, STARTING_RATING - loser.rating);
  assert.ok(Math.abs(winner.ratingDeviation - loser.ratingDeviation) < 1e-9);
});

test('a draw between equals barely moves the rating', () => {
  const after = updatePlayer(fresh(), fresh(), 0.5);
  assert.ok(Math.abs(after.rating - STARTING_RATING) <= 1, 'draw between equals is ~no change');
});

test('a draw moves the underdog up and the favorite down', () => {
  const underdog = updatePlayer(fresh(1400), fresh(1700), 0.5);
  const favorite = updatePlayer(fresh(1700), fresh(1400), 0.5);
  assert.ok(underdog.rating > 1400, 'underdog gains on a draw');
  assert.ok(favorite.rating < 1700, 'favorite loses on a draw');
});

test('RD decreases monotonically over a run of games (established play)', () => {
  let s = fresh();
  let prev = s.ratingDeviation;
  for (let i = 0; i < 15; i++) {
    s = updatePlayer(s, fresh(), i % 2 === 0 ? 1 : 0);
    assert.ok(s.ratingDeviation <= prev + 1e-9, `RD should not climb during active play (game ${i})`);
    prev = s.ratingDeviation;
  }
  assert.ok(s.ratingDeviation < DEFAULT_RD, 'RD is well below the new-player ceiling after a run');
});

test('inflateDeviation raises RD with idle time and is capped at DEFAULT_RD', () => {
  // Take a confident player (low RD) and idle them.
  let s = fresh();
  for (let i = 0; i < 30; i++) s = updatePlayer(s, fresh(), i % 2 === 0 ? 1 : 0);
  const lowRd = s.ratingDeviation;
  assert.ok(lowRd < 150, 'precondition: player is fairly confident');

  const after4Weeks = inflateDeviation(s, 4 * RATING_PERIOD_MS);
  assert.ok(after4Weeks > lowRd, 'idle time inflates RD');
  assert.ok(after4Weeks <= DEFAULT_RD);

  // A very long absence is capped at the new-player ceiling.
  const after5Years = inflateDeviation(s, 5 * 52 * RATING_PERIOD_MS);
  assert.equal(after5Years, DEFAULT_RD);

  // No elapsed time is a no-op (clamped to the ceiling).
  assert.equal(inflateDeviation(s, 0), lowRd);
});

test('inactivity constant c restores ~DEFAULT_RD after ~52 weeks from the floor', () => {
  const solid: Glicko2State = { rating: STARTING_RATING, ratingDeviation: MIN_RD, volatility: DEFAULT_VOLATILITY };
  const after52 = inflateDeviation(solid, 52 * RATING_PERIOD_MS);
  // Calibrated to land at DEFAULT_RD after ~52 weeks (within rounding/cap).
  assert.ok(Math.abs(after52 - DEFAULT_RD) < 1, `expected ~${DEFAULT_RD}, got ${after52}`);
});

test('bothPlayers returns complementary updates from one game', () => {
  const { white, black } = bothPlayers(fresh(1500), fresh(1500), 1);
  assert.ok(white.rating > 1500 && black.rating < 1500);
  // Equal players: white's gain equals black's loss.
  assert.equal(white.rating - 1500, 1500 - black.rating);
});

test('numeric sanity vector vs Glickman example (scaled to our anchor)', () => {
  // Glickman's worked example uses rating 1500, RD 200, vol 0.06 against three
  // opponents and reports RD' ~= 151.5 after the period. We reproduce the single
  // strongest signal here (a win over an equal-RD opponent) and assert the
  // update lands in a sane, paper-consistent neighborhood: rating up, RD shrinks
  // toward the established band, volatility stays near its start.
  const self: Glicko2State = { rating: 1500, ratingDeviation: 200, volatility: 0.06 };
  const opp: Glicko2State = { rating: 1400, ratingDeviation: 30, volatility: 0.06 };
  const after = updatePlayer(self, opp, 1, 1500); // anchor at 1500 to match the paper's scale
  assert.ok(after.rating > 1500 && after.rating < 1600, `rating in band, got ${after.rating}`);
  assert.ok(after.ratingDeviation > 150 && after.ratingDeviation < 200, `RD shrinks, got ${after.ratingDeviation}`);
  assert.ok(after.volatility > 0.05 && after.volatility < 0.07, `volatility stable, got ${after.volatility}`);
});

test('mu = 0 at the anchor (scale sanity)', () => {
  // A player exactly at the anchor maps to the internal origin: drawing an equal
  // opponent at the anchor leaves the rating put (within rounding).
  const after = updatePlayer(fresh(1300), fresh(1300), 0.5, 1300);
  assert.ok(Math.abs(after.rating - 1300) <= 1);
  // And GLICKO2_SCALE is the documented constant.
  assert.ok(Math.abs(GLICKO2_SCALE - 173.7178) < 1e-9);
});
