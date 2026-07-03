/**
 * Built-in computer opponents — one seeded user account per difficulty tier.
 *
 * A logged-in human can play a RANKED match against a bot and earn a real
 * Glicko-2 rating from it. The bot itself is a fixed rating yardstick: each tier
 * is pinned to a constant rating with a LOW, fixed rating deviation, so beating a
 * strong bot actually moves the human while the bot's own number never drifts.
 *
 * The bot's move is computed ON THE SERVER via the shared engine `chooseMove`
 * (see net/gameServer.ts); the client is never trusted to drive it. Bots:
 *   - are flagged `isBot` (survives all three repo backends),
 *   - are excluded from the leaderboard and "real player" stat counts,
 *   - never enter the human matchmaking queue,
 *   - have their rating/RD/volatility PINNED (finalize never persists changes).
 *
 * The id scheme `bot:<tier>` is stable and human-readable, so a bot match's
 * MatchRecord clearly names its computer opponent in match history.
 */
import {
  DIFFICULTY_ORDER,
  type Difficulty,
} from '../../../src/index.ts';
import type { Repository, User } from '../storage/types.ts';
import { DEFAULT_VOLATILITY } from '../rating/glicko2.ts';

/**
 * Fixed rating per difficulty tier. A monotonic ladder so a higher tier is a
 * tougher (higher-rated) opponent. Tune these freely — they are the single
 * source of truth for how strong each computer tier is rated. Keyed by every
 * member of DIFFICULTY_ORDER so adding a tier is a compile error here until it
 * gets a rating.
 */
export const BOT_RATINGS: Record<Difficulty, number> = {
  beginner: 800,
  easy: 1000,
  intermediate: 1200,
  medium: 1400,
  hard: 1600,
  expert: 1800,
};

/**
 * Fixed, LOW rating deviation for every bot. A confident yardstick: a small RD
 * means the human's rating moves the "expected" amount for the gap, and (because
 * we never persist the bot's post-game state) it stays exactly here forever.
 */
export const BOT_RATING_DEVIATION = 30;

/** Stable account id for a tier's bot, e.g. `bot:expert`. */
export function botUserId(tier: Difficulty): string {
  return `bot:${tier}`;
}

/** True iff this id is one of the built-in bot accounts. */
export function isBotUserId(id: string): boolean {
  return id.startsWith('bot:');
}

/** Human-facing display name, e.g. "Computer (Expert)". */
export function botUsername(tier: Difficulty): string {
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);
  return `Computer (${label})`;
}

/** The difficulty tier a bot id maps to, or null if the id is not a known bot. */
export function tierForBotId(id: string): Difficulty | null {
  if (!isBotUserId(id)) return null;
  const tier = id.slice('bot:'.length) as Difficulty;
  return DIFFICULTY_ORDER.includes(tier) ? tier : null;
}

/** Build the full User row for a tier's bot account (idempotent shape). */
export function botUser(tier: Difficulty, now = Date.now()): User {
  return {
    id: botUserId(tier),
    username: botUsername(tier),
    email: null,
    passwordHash: null,
    isGuest: false,
    isBot: true,
    emailVerified: false,
    rating: BOT_RATINGS[tier],
    ratingDeviation: BOT_RATING_DEVIATION,
    volatility: DEFAULT_VOLATILITY,
    ratedGames: 0,
    lastRatedAt: null,
    createdAt: now,
  };
}

/**
 * Seed one bot account per difficulty tier, idempotently. Safe to call on every
 * boot: a tier whose account already exists is re-synced to the current pinned
 * rating/RD (so tuning BOT_RATINGS takes effect on restart) and otherwise left
 * alone; a missing one is created.
 */
export async function seedBots(repo: Repository, now = Date.now()): Promise<void> {
  for (const tier of DIFFICULTY_ORDER) {
    const desired = botUser(tier, now);
    const existing = await repo.getUserById(desired.id);
    if (!existing) {
      await repo.createUser(desired);
      continue;
    }
    // Re-pin rating/RD/flags in case the constants were tuned or the row predates
    // the bot fields. Never touch createdAt.
    if (
      existing.rating !== desired.rating ||
      existing.ratingDeviation !== desired.ratingDeviation ||
      existing.isBot !== true
    ) {
      await repo.updateUser(desired.id, {
        rating: desired.rating,
        ratingDeviation: desired.ratingDeviation,
        volatility: desired.volatility,
        isBot: true,
        username: desired.username,
      });
    }
  }
}
