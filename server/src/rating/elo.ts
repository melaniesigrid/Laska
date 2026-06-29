/**
 * Elo rating, computed server-side after each ranked result.
 *
 * Elo is the simpler choice (the brief lists Elo vs Glicko-2). Glicko-2 handles
 * rating reliability/inactivity better and is a documented upgrade path in
 * TODO.md; the Repository already stores everything Glicko-2 would also need
 * except RD/volatility columns.
 *
 *   E = 1 / (1 + 10^((Ropp - Rself)/400))
 *   R' = R + K * (S - E)
 *
 * K-factor: higher while provisional (few rated games) so new players converge
 * quickly, then lower for stability.
 */

export type Score = 0 | 0.5 | 1;

export const PROVISIONAL_GAMES = 20;
export const K_PROVISIONAL = 40;
export const K_ESTABLISHED = 20;

export function expectedScore(ratingSelf: number, ratingOpp: number): number {
  return 1 / (1 + Math.pow(10, (ratingOpp - ratingSelf) / 400));
}

export function kFactor(ratedGames: number): number {
  return ratedGames < PROVISIONAL_GAMES ? K_PROVISIONAL : K_ESTABLISHED;
}

export interface RatingInput {
  rating: number;
  ratedGames: number;
}

export interface RatingChange {
  before: number;
  after: number;
  delta: number;
}

/**
 * Compute both players' new ratings from a single game.
 * `scoreA` is player A's result (1 win, 0.5 draw, 0 loss); B's is the complement.
 * Ratings are rounded to integers (conventional for display).
 */
export function updateRatings(
  a: RatingInput,
  b: RatingInput,
  scoreA: Score,
): { a: RatingChange; b: RatingChange } {
  const scoreB = (1 - scoreA) as Score;
  const expA = expectedScore(a.rating, b.rating);
  const expB = expectedScore(b.rating, a.rating);

  const newA = Math.round(a.rating + kFactor(a.ratedGames) * (scoreA - expA));
  const newB = Math.round(b.rating + kFactor(b.ratedGames) * (scoreB - expB));

  return {
    a: { before: a.rating, after: newA, delta: newA - a.rating },
    b: { before: b.rating, after: newB, delta: newB - b.rating },
  };
}
