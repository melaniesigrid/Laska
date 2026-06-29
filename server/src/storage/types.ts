/**
 * Persistence contracts. The server depends only on `Repository`, so the
 * in-memory implementation here can be swapped for PostgreSQL (users, ratings,
 * match history) + Redis (presence/matchmaking) without touching game logic.
 * See TODO.md for the production storage migration.
 */
import type { PlayerColor, VariantId } from '../../../src/index.ts';
import type { Rank } from '../rating/rank.ts';

export interface User {
  id: string;
  /** Display name, unique-ish; for guests this is auto-generated. */
  username: string;
  /** Lowercased email, or null for guests. Unique when present. */
  email: string | null;
  /** scrypt hash, or null for guests / social-only accounts. */
  passwordHash: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  /** Glicko-2 rating (Elo-scale display value). See rating/glicko2.ts. */
  rating: number;
  /** Glicko-2 rating deviation (uncertainty). New players start at DEFAULT_RD (350). */
  ratingDeviation: number;
  /** Glicko-2 volatility (result erraticness). New players start at DEFAULT_VOLATILITY (0.06). */
  volatility: number;
  /** Ranked games played; used for the rank ladder's provisional gate. */
  ratedGames: number;
  /** Epoch ms of the last ranked game, or null if never; drives RD inactivity inflation. */
  lastRatedAt: number | null;
  createdAt: number;
}

export type MatchResult = '1-0' | '0-1' | '1/2-1/2';

export interface MatchRecord {
  id: string;
  whiteId: string;
  blackId: string;
  /** Rule variant the match was played under (Laska by default). */
  variant: VariantId;
  /** Compact move list for replay (each move's from/to/captures path). */
  moves: SerializedMove[];
  result: MatchResult;
  /** How the game ended, for dispute resolution / display. */
  endReason: string;
  ranked: boolean;
  whiteRatingBefore: number;
  blackRatingBefore: number;
  whiteRatingAfter: number;
  blackRatingAfter: number;
  startedAt: number;
  endedAt: number;
}

export interface SerializedMove {
  from: number;
  to: number;
  captures: number[];
  by: PlayerColor;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  rating: number;
  /** Glicko-2 rating deviation, so clients can flag provisional standings. */
  ratingDeviation: number;
  ratedGames: number;
  /** Displayed rank derived from rating + confidence (see rating/rank.ts). */
  rank: Rank;
}

export interface PlatformStats {
  /** Epoch ms the snapshot was computed (the `now` passed to platformStats). */
  generatedAt: number;
  users: {
    total: number;
    /** Non-guest accounts (real signups). */
    registered: number;
    /** Anonymous guest accounts. */
    guests: number;
    /** Accounts with a verified email. */
    verified: number;
  };
  /** Distinct users active within each rolling window (see activity-signal note below). */
  active: { d1: number; d7: number; d30: number };
  /** New accounts created within each rolling window (from createdAt). */
  newUsers: { last24h: number; last7d: number; last30d: number };
  /** Last 30 calendar days (UTC), oldest→newest, every day present even if count 0. day = 'YYYY-MM-DD'. From createdAt. */
  signupsByDay: { day: string; count: number }[];
  matches: {
    total: number;
    ranked: number;
    last24h: number;
    last7d: number;
  };
}

export interface Repository {
  createUser(user: User): Promise<void>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  updateUser(id: string, patch: Partial<User>): Promise<void>;

  saveMatch(record: MatchRecord): Promise<void>;
  getMatch(id: string): Promise<MatchRecord | null>;
  getUserMatches(userId: string, limit: number): Promise<MatchRecord[]>;

  topByRating(limit: number): Promise<LeaderboardEntry[]>;

  /** Aggregate platform metrics for the admin dashboard. `now` is epoch ms (injected so it's testable/deterministic). */
  platformStats(now: number): Promise<PlatformStats>;

  /** Release any underlying resources (DB connections). Optional. */
  close?(): Promise<void>;
}
