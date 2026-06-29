/**
 * Glicko-2 rating, computed server-side after each ranked result.
 *
 * Glicko-2 (Glickman 2012) extends Elo with two extra per-player quantities:
 *   - ratingDeviation (RD): how uncertain we are about the rating. New/idle
 *     players have a high RD (their rating moves a lot); established players have
 *     a low RD (stable). RD shrinks with play and inflates with inactivity.
 *   - volatility (sigma): how erratic the player's results are. The volatility
 *     solver lets a string of upsets widen RD faster than steady play would.
 *
 * We run a "rating period = 1 game" streaming update (the Lichess approach for
 * live 1v1): each finished game immediately produces new states for both
 * players, rather than batching a period's games. This is the standard live
 * adaptation and keeps the rating responsive.
 *
 * Scale: Glicko-2 does its math on an internal scale (mu, phi) and we present a
 * familiar Elo-like number. The transform is anchored on the configured starting
 * rating so a fresh player at the start sits at mu = 0:
 *   mu  = (rating - anchor) / GLICKO2_SCALE
 *   phi = RD / GLICKO2_SCALE
 * Do NOT hardcode 1500 (Glickman's default anchor) — Laska starts at 1200.
 *
 * References: Glickman, "Example of the Glicko-2 system" (the canonical worked
 * example and the source of the iterative volatility solver below).
 */

/** System volatility constraint: smaller = volatility changes more slowly. */
export const TAU = 0.5;
/** RD of a brand-new (maximally uncertain) player. Also the RD ceiling. */
export const DEFAULT_RD = 350;
/** Starting volatility for a new player. */
export const DEFAULT_VOLATILITY = 0.06;
/** Elo-scale <-> Glicko-2-internal-scale conversion factor. */
export const GLICKO2_SCALE = 173.7178;
/** Default rating anchor (mu = 0). Mirrors config.startingRating's default. */
export const STARTING_RATING = 1200;
/**
 * RD floor after a played game. A player who keeps playing should never appear
 * fully "solved" — keep a small uncertainty so the rating can still react.
 */
export const MIN_RD = 30;
/** Convergence tolerance for the volatility (Illinois) solver. */
const CONVERGENCE_EPSILON = 1e-6;

/** One inactivity "period" for RD inflation: one week. */
export const RATING_PERIOD_MS = 1000 * 60 * 60 * 24 * 7;
/**
 * Inactivity constant `c`, calibrated so an idle player's RD climbs from a fully
 * confident RD back to DEFAULT_RD over ~52 periods (~1 year):
 *   c = sqrt((DEFAULT_RD^2 - MIN_RD^2) / 52)
 * Used as phi* = sqrt(phi^2 + c^2 * periods).
 */
export const INACTIVITY_C = Math.sqrt((DEFAULT_RD * DEFAULT_RD - MIN_RD * MIN_RD) / 52);

export type Score = 0 | 0.5 | 1;

export interface Glicko2State {
  rating: number;
  ratingDeviation: number;
  volatility: number;
}

/** g(phi): weights an opponent's influence by how certain their rating is. */
function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/** E(mu, mu_j, phi_j): expected score of the player against opponent j. */
function expected(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Iteratively solve for the new volatility sigma' using the Illinois algorithm
 * (a regula-falsi variant) exactly as specified in Glickman's paper. `delta` is
 * the estimated rating change, `v` the variance, `phi` the pre-period RD.
 */
function solveVolatility(sigma: number, phi: number, v: number, delta: number): number {
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const delta2 = delta * delta;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta2 - phi2 - v - ex);
    const den = 2 * (phi2 + v + ex) * (phi2 + v + ex);
    return num / den - (x - a) / (TAU * TAU);
  };

  // Initial bracket [A, B] per the paper.
  let A = a;
  let B: number;
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k += 1;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  let iterations = 0;
  while (Math.abs(B - A) > CONVERGENCE_EPSILON && iterations < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
    iterations += 1;
  }
  return Math.exp(A / 2);
}

function toInternal(state: Glicko2State, anchor: number): { mu: number; phi: number } {
  return {
    mu: (state.rating - anchor) / GLICKO2_SCALE,
    phi: state.ratingDeviation / GLICKO2_SCALE,
  };
}

/**
 * The pre-rating-period RD increase for inactivity. An absent player should
 * grow less certain over time so a stale rating is treated cautiously and can
 * move appropriately when they return. Returns the inflated RD (Elo scale),
 * capped at DEFAULT_RD. `elapsedMs <= 0` is a no-op.
 *
 * Call this in finalize BEFORE the game update, using now - lastRatedAt.
 */
export function inflateDeviation(state: Glicko2State, elapsedMs: number, anchor = STARTING_RATING): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return Math.min(state.ratingDeviation, DEFAULT_RD);
  const { phi } = toInternal(state, anchor);
  const periods = elapsedMs / RATING_PERIOD_MS;
  const c = INACTIVITY_C / GLICKO2_SCALE; // c on the internal scale
  const phiStar = Math.sqrt(phi * phi + c * c * periods);
  const rd = phiStar * GLICKO2_SCALE;
  return Math.min(DEFAULT_RD, rd);
}

/**
 * One game's Glicko-2 update for a single player against one opponent.
 * `score` is this player's result (1 win / 0.5 draw / 0 loss).
 *
 * Returns the new state: rating rounded to an integer for display; RD and
 * volatility kept as floats. RD is clamped to [MIN_RD, DEFAULT_RD] so a player
 * who keeps playing never looks fully solved and an upset never blows past the
 * new-player ceiling.
 *
 * NOTE: pass an already-inflated self/opponent RD via the state if you want
 * inactivity handled (see inflateDeviation) — this function does the within-game
 * step exactly and does not look at wall-clock time.
 */
export function updatePlayer(
  self: Glicko2State,
  opponent: Glicko2State,
  score: Score,
  anchor = STARTING_RATING,
): Glicko2State {
  const { mu, phi } = toInternal(self, anchor);
  const { mu: muJ, phi: phiJ } = toInternal(opponent, anchor);

  // Step 3: variance v of the player's rating from game outcomes.
  const gJ = g(phiJ);
  const e = expected(mu, muJ, phiJ);
  const v = 1 / (gJ * gJ * e * (1 - e));

  // Step 4: delta, the estimated rating change in the direction of improvement.
  const delta = v * gJ * (score - e);

  // Step 5: new volatility via the iterative solver.
  const sigmaPrime = solveVolatility(self.volatility, phi, v, delta);

  // Step 6: pre-rating-period RD bump using the new volatility.
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);

  // Step 7: new RD and rating on the internal scale.
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * gJ * (score - e);

  // Back to the Elo scale, with the RD floor/ceiling applied.
  const newRating = Math.round(muPrime * GLICKO2_SCALE + anchor);
  const newRd = Math.min(DEFAULT_RD, Math.max(MIN_RD, phiPrime * GLICKO2_SCALE));

  return { rating: newRating, ratingDeviation: newRd, volatility: sigmaPrime };
}

/**
 * Convenience for the symmetric 1v1 case: update both players from one game,
 * mirroring the old Elo `updateRatings` ergonomics for manager.ts. `scoreWhite`
 * is White's result; Black's is the complement. Both updates use the SAME input
 * states (neither sees the other's post-game rating), which is correct.
 */
export function bothPlayers(
  white: Glicko2State,
  black: Glicko2State,
  scoreWhite: Score,
  anchor = STARTING_RATING,
): { white: Glicko2State; black: Glicko2State } {
  const scoreBlack = (1 - scoreWhite) as Score;
  return {
    white: updatePlayer(white, black, scoreWhite, anchor),
    black: updatePlayer(black, white, scoreBlack, anchor),
  };
}
