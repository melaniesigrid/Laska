/**
 * Displayed rank ladder: a pure mapping from a player's rating + confidence to a
 * military rank shown in the UI. This is cosmetic on top of the numeric Glicko-2
 * rating — it never feeds back into matchmaking or the rating math.
 *
 * Go-structured ladder: a descending "climb" tier (Recruit -> Colonel) then an
 * open-ended "general" mastery tier. ONE NAMED RANK = 100 RATING POINTS, chosen
 * so a one-rank gap is ~Go's one-stone gap (≈64% win expectancy for the stronger
 * player). The starting rating (1200) lands in the Sergeant band so a fresh,
 * calibrated player reads as a mid-climb soldier rather than the very bottom.
 *
 * Sub-ranks (stars): every rank carries stars, so progress is always visible and
 * promotions come ~3x more often than crossing a whole named rank.
 *  - climb ranks: each 100-pt band is split into 3 stars (★1..★3, ~33 pts each).
 *    Named-rank BOUNDARIES are unchanged — a Sergeant is still 1150–1249 — the
 *    stars only subdivide within. ★3 of one rank promotes to ★1 of the next.
 *  - general tier: open-ended prestige stars (★1..★9), one per 100 pts. Here a
 *    star is a full skill step (dan-style), not a sub-division.
 *
 * Calibration gate: promotion INTO the general tier is gated on the rating being
 * trustworthy. While provisional (RD too high or too few rated games) the
 * displayed rank is clamped to at most Colonel ★3 even if the raw rating
 * qualifies for General — you cannot fluke into a star off a tiny, noisy sample.
 */

export interface Rank {
  /** Which half of the ladder this rank sits in. */
  tier: 'climb' | 'general';
  /** Stable machine id: 'recruit'…'colonel' for climb, 'general' for the mastery tier. */
  key: string;
  /** Human display label, e.g. 'Sergeant' or 'General'. */
  name: string;
  /** Sub-rank within the named rank: 1..3 for climb ranks, 1..9 for general prestige. */
  stars: number;
  /** Monotonic ladder position 0..32 (Recruit★1=0 … Colonel★3=23 … General★9=32). */
  index: number;
  /** True when the rating is not yet trustworthy (ratedGames < 10 OR RD > 110). */
  provisional: boolean;
  /** Fraction 0..1 toward the next star within the current sub-band (1 at the cap). */
  progress: number;
}

/** A player is "provisional" (uncalibrated) below this many rated games. */
export const PROVISIONAL_GAMES = 10;
/** ...or above this rating deviation. Mirrors Glicko-2's confidence sense. */
export const PROVISIONAL_RD = 110;

/** Points per named rank step. Matches Go's one-stone-per-rank spacing. */
const BAND_SIZE = 100;
/** Each climb rank is split into this many stars. */
const STARS_PER_CLIMB_RANK = 3;
/** Width of one climb star sub-band (~33.3 pts). */
const CLIMB_STAR_SIZE = BAND_SIZE / STARS_PER_CLIMB_RANK;
/** Lower bound of the lowest *named* climb band (Private). Below this is Recruit. */
const FIRST_BAND_FLOOR = 950;
/** Lower bound of the general tier (General ★1). */
const GENERAL_FLOOR = 1650;
/** Highest general prestige star awarded; ratings above ★9's band stay ★9. */
const MAX_GENERAL_STARS = 9;

/**
 * The climb tier, lowest -> highest. `bandIdx` 0..7 (Recruit..Colonel). Each
 * named band is [floor, floor + BAND_SIZE); Recruit is everything below Private.
 */
const CLIMB: { key: string; name: string; floor: number }[] = [
  { key: 'recruit', name: 'Recruit', floor: -Infinity },
  { key: 'private', name: 'Private', floor: 950 },
  { key: 'corporal', name: 'Corporal', floor: 1050 },
  { key: 'sergeant', name: 'Sergeant', floor: 1150 }, // 1200 (start) lands here
  { key: 'lieutenant', name: 'Lieutenant', floor: 1250 },
  { key: 'captain', name: 'Captain', floor: 1350 },
  { key: 'major', name: 'Major', floor: 1450 },
  { key: 'colonel', name: 'Colonel', floor: 1550 },
];
/** Number of monotonic rungs in the climb tier (8 bands x 3 stars). */
const CLIMB_RUNGS = CLIMB.length * STARS_PER_CLIMB_RANK; // 24

function isProvisional(ratingDeviation: number, ratedGames: number): boolean {
  return ratedGames < PROVISIONAL_GAMES || ratingDeviation > PROVISIONAL_RD;
}

/**
 * Map a rating + confidence to a displayed rank with sub-rank stars.
 *
 * Provisional players are clamped to at most Colonel ★3: even a 1700+ rating reads
 * as the climb ceiling until calibrated, so a general star is always earned.
 */
export function rankFor(input: { rating: number; ratingDeviation: number; ratedGames: number }): Rank {
  const { rating, ratingDeviation, ratedGames } = input;
  const provisional = isProvisional(ratingDeviation, ratedGames);

  // General tier — only reachable once calibrated. Stars are full skill steps.
  if (rating >= GENERAL_FLOOR && !provisional) {
    const rawStars = Math.floor((rating - GENERAL_FLOOR) / BAND_SIZE) + 1;
    const stars = Math.min(MAX_GENERAL_STARS, rawStars);
    const index = CLIMB_RUNGS + (stars - 1); // General★1 = 24 … General★9 = 32
    const progress =
      stars >= MAX_GENERAL_STARS ? 1 : (rating - (GENERAL_FLOOR + (stars - 1) * BAND_SIZE)) / BAND_SIZE;
    return { tier: 'general', key: 'general', name: 'General', stars, index, provisional, progress };
  }

  // Climb tier (and the provisional clamp). Find the highest band the rating meets.
  let bandIdx = 0;
  for (let i = CLIMB.length - 1; i >= 0; i--) {
    if (rating >= CLIMB[i]!.floor) {
      bandIdx = i;
      break;
    }
  }
  const band = CLIMB[bandIdx]!;
  // Recruit has no hard floor; use a soft one (one band below Private) for star math.
  const bandFloor = bandIdx === 0 ? FIRST_BAND_FLOOR - BAND_SIZE : band.floor;

  let star: number;
  let progress: number;
  if (provisional && rating >= GENERAL_FLOOR) {
    // Uncalibrated but general-strength: pin to the climb ceiling, Colonel ★3.
    star = STARS_PER_CLIMB_RANK;
    progress = 1;
  } else {
    const raw = Math.floor((rating - bandFloor) / CLIMB_STAR_SIZE) + 1;
    star = Math.min(STARS_PER_CLIMB_RANK, Math.max(1, raw));
    const starFloor = bandFloor + (star - 1) * CLIMB_STAR_SIZE;
    progress = clamp01((rating - starFloor) / CLIMB_STAR_SIZE);
  }

  const index = bandIdx * STARS_PER_CLIMB_RANK + (star - 1);
  return { tier: 'climb', key: band.key, name: band.name, stars: star, index, provisional, progress };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
