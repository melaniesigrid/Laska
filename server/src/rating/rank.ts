/**
 * Displayed rank ladder: a pure mapping from a player's rating + confidence to a
 * military rank shown in the UI. This is cosmetic on top of the numeric Glicko-2
 * rating — it never feeds back into matchmaking or the rating math.
 *
 * Go-structured ladder: a descending "climb" tier (Recruit -> Colonel) then an
 * open-ended "general" mastery tier (General with 1..9 stars). ONE RANK = 100
 * RATING POINTS, chosen deliberately so a one-rank gap is ~Go's one-stone gap
 * (≈64% win expectancy for the stronger player). The starting rating (1200)
 * lands in the Sergeant band so a fresh, calibrated player reads as a mid-climb
 * soldier rather than the very bottom.
 *
 * Calibration gate: promotion INTO the general tier (any star) is gated on the
 * rating being trustworthy. While a player is provisional (RD too high or too
 * few rated games) their displayed rank is clamped to at most Colonel even if
 * their raw rating qualifies for General — you cannot fluke your way into a star
 * off a tiny, high-variance sample. Once calibrated, the general tier opens up.
 */

export interface Rank {
  /** Which half of the ladder this rank sits in. */
  tier: 'climb' | 'general';
  /** Stable machine id: 'recruit'…'colonel' for climb, 'general' for the mastery tier. */
  key: string;
  /** Human display label, e.g. 'Sergeant' or 'General'. */
  name: string;
  /** 0 for climb ranks; 1..9 for general stars. */
  stars: number;
  /** Monotonic ladder position 0..16 (Recruit=0 … General★9=16) for sorting/comparison. */
  index: number;
  /** True when the rating is not yet trustworthy (ratedGames < 10 OR RD > 110). */
  provisional: boolean;
  /** Fraction 0..1 toward the next rank's lower bound within the current band (1 at the cap). */
  progress: number;
}

/** A player is "provisional" (uncalibrated) below this many rated games. */
export const PROVISIONAL_GAMES = 10;
/** ...or above this rating deviation. Mirrors Glicko-2's confidence sense. */
export const PROVISIONAL_RD = 110;

/** Points per rank step. Matches Go's one-stone-per-rank spacing. */
const BAND_SIZE = 100;
/** Lower bound of the lowest *named* climb band (Private). Below this is Recruit. */
const FIRST_BAND_FLOOR = 950;
/** Lower bound of the general tier (General ★1). */
const GENERAL_FLOOR = 1650;
/** Highest star awarded; ratings above ★9's band stay ★9. */
const MAX_STARS = 9;

/**
 * The climb tier, lowest -> highest. `index` 0..7 (Recruit..Colonel). Each named
 * band is [floor, floor + BAND_SIZE); Recruit is everything below Private.
 */
const CLIMB: { key: string; name: string; floor: number; index: number }[] = [
  { key: 'recruit', name: 'Recruit', floor: -Infinity, index: 0 },
  { key: 'private', name: 'Private', floor: 950, index: 1 },
  { key: 'corporal', name: 'Corporal', floor: 1050, index: 2 },
  { key: 'sergeant', name: 'Sergeant', floor: 1150, index: 3 }, // 1200 (start) lands here
  { key: 'lieutenant', name: 'Lieutenant', floor: 1250, index: 4 },
  { key: 'captain', name: 'Captain', floor: 1350, index: 5 },
  { key: 'major', name: 'Major', floor: 1450, index: 6 },
  { key: 'colonel', name: 'Colonel', floor: 1550, index: 7 },
];
/** index of Colonel — the cap a provisional player is clamped to. */
const COLONEL_INDEX = 7;

function isProvisional(ratingDeviation: number, ratedGames: number): boolean {
  return ratedGames < PROVISIONAL_GAMES || ratingDeviation > PROVISIONAL_RD;
}

/**
 * Map a rating + confidence to a displayed rank.
 *
 * Provisional players are clamped to at most Colonel: even a 1700+ rating reads
 * as Colonel (with full progress) until calibrated, so a star is always earned.
 */
export function rankFor(input: { rating: number; ratingDeviation: number; ratedGames: number }): Rank {
  const { rating, ratingDeviation, ratedGames } = input;
  const provisional = isProvisional(ratingDeviation, ratedGames);

  // General tier — only reachable once calibrated.
  if (rating >= GENERAL_FLOOR && !provisional) {
    const rawStars = Math.floor((rating - GENERAL_FLOOR) / BAND_SIZE) + 1;
    const stars = Math.min(MAX_STARS, rawStars);
    const index = COLONEL_INDEX + stars; // Colonel=7 -> General★1=8 … General★9=16
    let progress: number;
    if (stars >= MAX_STARS) {
      progress = 1; // capped band
    } else {
      const bandFloor = GENERAL_FLOOR + (stars - 1) * BAND_SIZE;
      progress = (rating - bandFloor) / BAND_SIZE;
    }
    return { tier: 'general', key: 'general', name: 'General', stars, index, provisional, progress };
  }

  // Climb tier (also where provisional players are clamped to ≤ Colonel).
  // Find the highest climb band whose floor the rating meets.
  let bandIdx = 0;
  for (let i = CLIMB.length - 1; i >= 0; i--) {
    if (rating >= CLIMB[i]!.floor) {
      bandIdx = i;
      break;
    }
  }
  // Calibration clamp: a provisional player can show no higher than Colonel.
  if (bandIdx > COLONEL_INDEX) bandIdx = COLONEL_INDEX;
  const band = CLIMB[bandIdx]!;

  // Progress toward the next band's floor, within this band.
  let progress: number;
  if (bandIdx >= COLONEL_INDEX) {
    // Colonel: progress toward the General floor (1 if a provisional player is
    // already at/over it — they've "earned" the band but await calibration).
    progress = clamp01((rating - band.floor) / (GENERAL_FLOOR - band.floor));
  } else if (bandIdx === 0) {
    // Recruit: progress from a soft floor (one band below Private) up to Private.
    const recruitFloor = FIRST_BAND_FLOOR - BAND_SIZE;
    progress = clamp01((rating - recruitFloor) / (FIRST_BAND_FLOOR - recruitFloor));
  } else {
    const nextFloor = CLIMB[bandIdx + 1]!.floor;
    progress = clamp01((rating - band.floor) / (nextFloor - band.floor));
  }

  return {
    tier: 'climb',
    key: band.key,
    name: band.name,
    stars: 0,
    index: band.index,
    provisional,
    progress,
  };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
