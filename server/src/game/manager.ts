/**
 * Owns all active matches and turns a finished game into durable side effects:
 * server-side Glicko-2 rating update (ranked only) and a persisted MatchRecord.
 *
 * Reconnection: matches are keyed by id and also indexed by player id, so a
 * client that drops can look up its in-progress match and resync from the
 * authoritative state. The match keeps running on its clock while they are away.
 */
import { randomUUID } from 'node:crypto';
import type { VariantId } from '../../../src/index.ts';
import type { Repository, MatchRecord, MatchResult } from '../storage/types.ts';
import { bothPlayers, inflateDeviation, STARTING_RATING, type Score } from '../rating/glicko2.ts';
import { rankFor, type Rank } from '../rating/rank.ts';
import { Match, type MatchEndInfo, type TimeControl } from './match.ts';

interface SideRatingChange {
  before: number;
  after: number;
  delta: number;
  /** Displayed rank before/after this game — powers rank-up celebration. */
  rank: { before: Rank; after: Rank };
}

export interface FinishedSummary {
  matchId: string;
  end: MatchEndInfo;
  ranked: boolean;
  ratingChange: {
    white: SideRatingChange;
    black: SideRatingChange;
  } | null;
}

function resultToScoreA(result: MatchResult): Score {
  // Player A = White.
  if (result === '1-0') return 1;
  if (result === '0-1') return 0;
  return 0.5;
}

export class MatchManager {
  private active = new Map<string, Match>();
  private byUser = new Map<string, string>(); // userId -> matchId (their current match)

  /**
   * @param anchor Glicko-2 rating anchor (mu = 0). Must equal config.startingRating
   *   so a fresh player maps to the internal origin. Defaults to STARTING_RATING.
   */
  constructor(
    private repo: Repository,
    private anchor: number = STARTING_RATING,
  ) {}

  createMatch(
    whiteId: string,
    blackId: string,
    opts: { ranked: boolean; timeControl?: TimeControl; variant?: VariantId } = { ranked: true },
  ): Match {
    const id = randomUUID();
    const params: ConstructorParameters<typeof Match>[0] = {
      id,
      whiteId,
      blackId,
      ranked: opts.ranked,
    };
    if (opts.timeControl) params.timeControl = opts.timeControl;
    if (opts.variant) params.variant = opts.variant;
    const match = new Match(params);
    this.active.set(id, match);
    this.byUser.set(whiteId, id);
    this.byUser.set(blackId, id);
    return match;
  }

  getMatch(id: string): Match | undefined {
    return this.active.get(id);
  }

  getActiveMatchForUser(userId: string): Match | undefined {
    const id = this.byUser.get(userId);
    return id ? this.active.get(id) : undefined;
  }

  /** All currently-active matches (for clock enforcement ticks). */
  activeMatches(): Match[] {
    return [...this.active.values()];
  }

  /**
   * Finalize a match: persist the record, update ratings if ranked, and remove
   * it from the active set. Safe to call once per match (idempotent-ish: a
   * second call for an unknown id is a no-op).
   */
  async finalize(matchId: string, end: MatchEndInfo): Promise<FinishedSummary> {
    const match = this.active.get(matchId);
    if (!match) {
      return { matchId, end, ranked: false, ratingChange: null };
    }

    const white = await this.repo.getUserById(match.whiteId);
    const black = await this.repo.getUserById(match.blackId);

    let ratingChange: FinishedSummary['ratingChange'] = null;
    let whiteBefore = white?.rating ?? 0;
    let blackBefore = black?.rating ?? 0;
    let whiteAfter = whiteBefore;
    let blackAfter = blackBefore;

    if (match.ranked && white && black) {
      const endedAt = match.endedAtMs() || Date.now();
      const scoreWhite = resultToScoreA(end.result);

      // Rank BEFORE, from the stored (pre-game) state.
      const whiteRankBefore = rankFor({
        rating: white.rating,
        ratingDeviation: white.ratingDeviation,
        ratedGames: white.ratedGames,
      });
      const blackRankBefore = rankFor({
        rating: black.rating,
        ratingDeviation: black.ratingDeviation,
        ratedGames: black.ratedGames,
      });

      // (a) Inflate each player's RD for time idle since their last ranked game,
      // so a long-absent player's rating can move appropriately on return. A bot
      // is a fixed yardstick: its RD is NEVER inflated — it always faces the
      // opponent at its pinned, confident rating.
      const whiteRd =
        !white.isBot && white.lastRatedAt !== null
          ? inflateDeviation(
              { rating: white.rating, ratingDeviation: white.ratingDeviation, volatility: white.volatility },
              endedAt - white.lastRatedAt,
              this.anchor,
            )
          : white.ratingDeviation;
      const blackRd =
        !black.isBot && black.lastRatedAt !== null
          ? inflateDeviation(
              { rating: black.rating, ratingDeviation: black.ratingDeviation, volatility: black.volatility },
              endedAt - black.lastRatedAt,
              this.anchor,
            )
          : black.ratingDeviation;

      // (b) Single-game Glicko-2 update for both players (same input states). The
      // bot's pinned rating + low RD are the opponent input that moves the human.
      const next = bothPlayers(
        { rating: white.rating, ratingDeviation: whiteRd, volatility: white.volatility },
        { rating: black.rating, ratingDeviation: blackRd, volatility: black.volatility },
        scoreWhite,
        this.anchor,
      );

      whiteBefore = white.rating;
      blackBefore = black.rating;
      // A bot's rating is PINNED: report (and persist) no change for it, even
      // though bothPlayers computed a hypothetical new value. The human's update
      // is unaffected — it already used the bot's fixed rating/RD as input above.
      whiteAfter = white.isBot ? whiteBefore : next.white.rating;
      blackAfter = black.isBot ? blackBefore : next.black.rating;

      // (c) Persist new rating/RD/volatility, bump ratedGames, stamp lastRatedAt —
      // but ONLY for real players. A bot's row is left exactly as seeded so each
      // tier stays a fixed rating yardstick (rating, RD, volatility, ratedGames,
      // lastRatedAt all untouched), and it never drifts game over game.
      if (!white.isBot) {
        await this.repo.updateUser(white.id, {
          rating: next.white.rating,
          ratingDeviation: next.white.ratingDeviation,
          volatility: next.white.volatility,
          ratedGames: white.ratedGames + 1,
          lastRatedAt: endedAt,
        });
      }
      if (!black.isBot) {
        await this.repo.updateUser(black.id, {
          rating: next.black.rating,
          ratingDeviation: next.black.ratingDeviation,
          volatility: next.black.volatility,
          ratedGames: black.ratedGames + 1,
          lastRatedAt: endedAt,
        });
      }

      // Rank AFTER. For a real player, from the new state (ratedGames already
      // incremented). For a bot, identical to BEFORE — its standing never moves.
      const whiteRankAfter = white.isBot
        ? whiteRankBefore
        : rankFor({
            rating: next.white.rating,
            ratingDeviation: next.white.ratingDeviation,
            ratedGames: white.ratedGames + 1,
          });
      const blackRankAfter = black.isBot
        ? blackRankBefore
        : rankFor({
            rating: next.black.rating,
            ratingDeviation: next.black.ratingDeviation,
            ratedGames: black.ratedGames + 1,
          });

      ratingChange = {
        white: {
          before: whiteBefore,
          after: whiteAfter,
          delta: whiteAfter - whiteBefore,
          rank: { before: whiteRankBefore, after: whiteRankAfter },
        },
        black: {
          before: blackBefore,
          after: blackAfter,
          delta: blackAfter - blackBefore,
          rank: { before: blackRankBefore, after: blackRankAfter },
        },
      };
    }

    const record: MatchRecord = {
      id: match.id,
      whiteId: match.whiteId,
      blackId: match.blackId,
      variant: match.variantId,
      moves: match.serializedMoves(),
      result: end.result,
      endReason: end.reason,
      ranked: match.ranked,
      whiteRatingBefore: whiteBefore,
      blackRatingBefore: blackBefore,
      whiteRatingAfter: whiteAfter,
      blackRatingAfter: blackAfter,
      startedAt: match.startedAt,
      endedAt: match.endedAtMs() || Date.now(),
    };
    await this.repo.saveMatch(record);

    // Release the match from the active set / user index.
    this.active.delete(matchId);
    if (this.byUser.get(match.whiteId) === matchId) this.byUser.delete(match.whiteId);
    if (this.byUser.get(match.blackId) === matchId) this.byUser.delete(match.blackId);

    return { matchId, end, ranked: match.ranked, ratingChange };
  }
}
