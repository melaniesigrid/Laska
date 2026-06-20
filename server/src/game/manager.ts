/**
 * Owns all active matches and turns a finished game into durable side effects:
 * server-side Elo update (ranked only) and a persisted MatchRecord.
 *
 * Reconnection: matches are keyed by id and also indexed by player id, so a
 * client that drops can look up its in-progress match and resync from the
 * authoritative state. The match keeps running on its clock while they are away.
 */
import { randomUUID } from 'node:crypto';
import type { Repository, MatchRecord, MatchResult } from '../storage/types.ts';
import { updateRatings, type Score } from '../rating/elo.ts';
import { Match, type MatchEndInfo, type TimeControl } from './match.ts';

export interface FinishedSummary {
  matchId: string;
  end: MatchEndInfo;
  ranked: boolean;
  ratingChange: {
    white: { before: number; after: number; delta: number };
    black: { before: number; after: number; delta: number };
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

  constructor(private repo: Repository) {}

  createMatch(
    whiteId: string,
    blackId: string,
    opts: { ranked: boolean; timeControl?: TimeControl } = { ranked: true },
  ): Match {
    const id = randomUUID();
    const params: ConstructorParameters<typeof Match>[0] = {
      id,
      whiteId,
      blackId,
      ranked: opts.ranked,
    };
    if (opts.timeControl) params.timeControl = opts.timeControl;
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
      const scoreWhite = resultToScoreA(end.result);
      const change = updateRatings(
        { rating: white.rating, ratedGames: white.ratedGames },
        { rating: black.rating, ratedGames: black.ratedGames },
        scoreWhite,
      );
      whiteBefore = change.a.before;
      blackBefore = change.b.before;
      whiteAfter = change.a.after;
      blackAfter = change.b.after;
      await this.repo.updateUser(white.id, {
        rating: whiteAfter,
        ratedGames: white.ratedGames + 1,
      });
      await this.repo.updateUser(black.id, {
        rating: blackAfter,
        ratedGames: black.ratedGames + 1,
      });
      ratingChange = {
        white: { before: whiteBefore, after: whiteAfter, delta: change.a.delta },
        black: { before: blackBefore, after: blackAfter, delta: change.b.delta },
      };
    }

    const record: MatchRecord = {
      id: match.id,
      whiteId: match.whiteId,
      blackId: match.blackId,
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
